import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { cmsContent, cmsVariant } from "../../../db/schema/cms";
import { FeatureAvailability } from "../../core/features/FeatureAvailability";
import { cmsPublicationJob } from "../../../db/schema/publication-jobs";
import {
  DomainError,
  type ResolveScheduledActor,
} from "../../core/authorization/AuthorizationService";
import { AuditRepository } from "../../core/audit/AuditRepository";
import type { Database } from "../../infrastructure/database/client";
import { CmsScopePolicy } from "./CmsScopePolicy";
import { CmsService } from "./CmsService";

type Claim = {
  id: string;
  contentId: string;
  requestedBy: string;
  sessionId: string;
};

/** Bounded database-only work, invoked by the existing local jobs command. */
export class CmsPublicationRunner {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly cms: CmsService,
    private readonly scope: CmsScopePolicy,
    private readonly resolveActor: ResolveScheduledActor,
  ) {}

  private async identity(job: Claim) {
    const current = await this.resolveActor(job.sessionId, job.requestedBy);
    if (!current || current.expiresAt.getTime() <= Date.now())
      throw new DomainError(
        "SCHEDULE_ACCESS",
        "The requesting session is no longer available.",
        403,
      );
    return current.actor;
  }
  async runBatch(limit = 5) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error("INVALID_JOB_BATCH_SIZE");
    const result = {
      processed: 0,
      published: 0,
      cancelled: 0,
      failed: 0,
      deferred: 0,
    };
    const exhausted = await this.db
      .execute(sql`UPDATE club.cms_publication_job SET status = 'failed',
      finished_at = now(), lease_token = NULL, lease_expires_at = NULL, error_code = 'ATTEMPTS_EXHAUSTED'
      WHERE attempts >= 3 AND (status = 'pending' OR (status = 'processing' AND lease_expires_at <= now()))`);
    result.failed += exhausted.rowCount ?? 0;
    for (let index = 0; index < limit; index++) {
      const lease = randomUUID();
      const claimed = await this.db.execute<Claim>(sql`
        WITH candidate AS (
          SELECT id FROM club.cms_publication_job
          WHERE attempts < 3 AND ((status = 'pending' AND available_at <= now())
            OR (status = 'processing' AND lease_expires_at <= now()))
          ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE club.cms_publication_job AS job SET status = 'processing', attempts = job.attempts + 1,
          lease_token = ${lease}, lease_expires_at = now() + interval '1 minute'
        FROM candidate WHERE job.id = candidate.id
        RETURNING job.id, job.content_id AS "contentId", job.requested_by AS "requestedBy", job.session_id AS "sessionId"`);
      const claim = claimed.rows[0];
      if (!claim) break;
      result.processed++;
      try {
        const actor = await this.identity(claim);
        const published = await this.db.transaction(async (tx) => {
          // Same organization lock/order as draft edits, publication and schedule cancellation.
          const scope = await this.scope.lock(
            actor,
            claim.contentId,
            "cms.publish",
            tx,
          );
          const [job] = await tx
            .select()
            .from(cmsPublicationJob)
            .where(eq(cmsPublicationJob.id, claim.id))
            .for("update");
          if (
            !job ||
            job.status !== "processing" ||
            job.leaseToken !== lease ||
            job.leaseExpiresAt!.getTime() <= Date.now()
          )
            return false;
          const current = await this.identity(claim);
          const [content] = await tx
            .select({ eventId: cmsContent.eventId })
            .from(cmsContent)
            .where(
              and(
                eq(cmsContent.id, job.contentId),
                eq(cmsContent.organizationId, job.organizationId),
              ),
            );
          if (content?.eventId)
            await new FeatureAvailability(this.db).requireQueuedWork(
              job.organizationId,
              "events",
              job.createdAt,
              tx,
            );
          if (scope.organizationId !== job.organizationId)
            throw new DomainError(
              "SCHEDULE_ACCESS",
              "The organization changed.",
              403,
            );
          const [variant] = await tx
            .select()
            .from(cmsVariant)
            .where(eq(cmsVariant.id, job.variantId));
          if (
            !variant ||
            variant.draftRevisionId !== job.revisionId ||
            variant.publicationVersion !== job.publicationVersion
          )
            throw new DomainError(
              "SCHEDULE_STALE",
              "The reviewed content changed.",
              409,
            );
          await this.cms.publishRevision(
            current,
            {
              id: job.contentId,
              locale: variant.locale,
              expectedRevisionId: job.revisionId,
            },
            tx,
          );
          await tx
            .update(cmsPublicationJob)
            .set({
              status: "succeeded",
              finishedAt: new Date(),
              errorCode: null,
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(eq(cmsPublicationJob.id, job.id));
          await this.audit.record(tx, {
            organizationId: job.organizationId,
            actorUserId: current.userId,
            action: "cms.publication.completed",
            targetId: job.contentId,
          });
          return true;
        });
        if (published) result.published++;
      } catch (error) {
        if (error instanceof DomainError) {
          const access = [
            "SCHEDULE_ACCESS",
            "ACCESS_DENIED",
            "GOOGLE_SESSION_REQUIRED",
            "AUTH_METHOD_REQUIRED",
            "VERIFIED_IDENTITY_REQUIRED",
            "CONTENT_NOT_FOUND",
            "EVENT_NOT_FOUND",
            "EVENT_ACCESS_DENIED",
            "EVENT_ARCHIVED",
            "EVENT_CANCELLED",
            "EVENT_MODULE_DISABLED",
            "FEATURE_DISABLED",
            "FEATURE_WORK_CANCELLED",
          ].includes(error.code);
          const code =
            error.code === "SCHEDULE_STALE" || error.code === "CONTENT_ARCHIVED"
              ? "CONTENT_CHANGED"
              : access
                ? "ACCESS_CHANGED"
                : "PUBLICATION_INVALID";
          const status =
            code === "PUBLICATION_INVALID" ? "failed" : "cancelled";
          const rows = await this.db
            .update(cmsPublicationJob)
            .set({
              status,
              finishedAt: new Date(),
              errorCode: code,
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(
              and(
                eq(cmsPublicationJob.id, claim.id),
                eq(cmsPublicationJob.leaseToken, lease),
                eq(cmsPublicationJob.status, "processing"),
              ),
            )
            .returning({ id: cmsPublicationJob.id });
          result[status] += rows.length;
        } else {
          // No raw SQL/auth/media exceptions in history or logs. Three attempts total.
          const retry = await this.db.execute<{
            status: "pending" | "failed";
          }>(sql`UPDATE club.cms_publication_job SET
            status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
            finished_at = CASE WHEN attempts >= 3 THEN now() ELSE NULL END,
            available_at = now() + interval '1 minute', lease_token = NULL, lease_expires_at = NULL,
            error_code = CASE WHEN attempts >= 3 THEN 'ATTEMPTS_EXHAUSTED' ELSE 'RETRY_PENDING' END
            WHERE id = ${claim.id} AND lease_token = ${lease} AND status = 'processing'
            RETURNING status`);
          if (retry.rows[0]?.status === "failed") result.failed++;
          if (retry.rows[0]?.status === "pending") result.deferred++;
        }
      }
    }
    return result;
  }
}
