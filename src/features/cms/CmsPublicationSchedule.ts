import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { cmsPublicationJob } from "../../../db/schema/publication-jobs";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  type TrustedActor,
  type ResolveScheduledActor,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { CmsScopePolicy } from "./CmsScopePolicy";
import { CmsRepository } from "./CmsRepository";
import { cmsLocaleSchema, type CmsLocale } from "./cms_schemas";
import {
  publicationCancelInput,
  publicationScheduleInput,
  publicationMessages,
  type PublicationScheduleDto,
} from "./publication_schemas";

export class CmsPublicationSchedule {
  private readonly repository: CmsRepository;
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly scope: CmsScopePolicy,
    private readonly resolveActor: ResolveScheduledActor,
  ) {
    this.repository = new CmsRepository(db);
  }
  private async target(
    actor: TrustedActor,
    id: string,
    locale: CmsLocale,
    db: DatabaseExecutor,
  ) {
    const { organizationId } = await this.scope.read(actor, id, db);
    const content = await this.repository.content(organizationId, id, db);
    const variant = await this.repository.variant(
      organizationId,
      id,
      locale,
      db,
    );
    if (!content || !variant || !variant.draftRevisionId)
      throw new DomainError(
        "CONTENT_NOT_FOUND",
        "Content is unavailable.",
        404,
      );
    return { organizationId, content, variant };
  }
  async workspace(
    actor: TrustedActor,
    rawId: string,
    rawLocale: unknown,
  ): Promise<PublicationScheduleDto> {
    const id = z.uuid().parse(rawId),
      locale = cmsLocaleSchema.parse(rawLocale);
    const { organizationId, variant } = await this.target(
      actor,
      id,
      locale,
      this.db,
    );
    const rows = await this.db
      .select()
      .from(cmsPublicationJob)
      .where(
        and(
          eq(cmsPublicationJob.organizationId, organizationId),
          eq(cmsPublicationJob.variantId, variant.id),
        ),
      )
      .orderBy(desc(cmsPublicationJob.createdAt))
      .limit(10);
    return {
      publishedRevisionId: variant.publishedRevisionId,
      activeId:
        rows.find((r) => r.status === "pending" || r.status === "processing")
          ?.id ?? null,
      jobs: rows.map((r) => ({
        id: r.id,
        revisionId: r.revisionId,
        status: r.status,
        attempts: r.attempts,
        dueAt: r.dueAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        delayed:
          (r.status === "pending" && r.dueAt.getTime() < Date.now()) ||
          (r.status === "processing" &&
            r.leaseExpiresAt!.getTime() < Date.now()),
        message: r.errorCode
          ? (publicationMessages[r.errorCode] ??
            publicationMessages.PUBLICATION_INVALID)
          : null,
      })),
    };
  }
  async schedule(actor: TrustedActor, input: unknown) {
    const values = publicationScheduleInput.parse(input);
    await this.db.transaction(async (tx) => {
      await this.scope.lock(actor, values.id, "cms.publish", tx);
      const { organizationId, content, variant } = await this.target(
        actor,
        values.id,
        values.locale,
        tx,
      );
      const [replay] = await tx
        .select()
        .from(cmsPublicationJob)
        .where(
          and(
            eq(cmsPublicationJob.organizationId, organizationId),
            eq(cmsPublicationJob.requestId, values.requestId),
          ),
        );
      if (replay) {
        if (
          replay.variantId !== variant.id ||
          replay.revisionId !== values.expectedRevisionId ||
          replay.requestedBy !== actor.userId ||
          replay.dueAt.toISOString() !== values.dueAt
        )
          throw new DomainError(
            "SCHEDULE_CONFLICT",
            "This request was already used for another schedule.",
            409,
          );
        return;
      }
      const identity = await this.resolveActor(actor.sessionId, actor.userId);
      const dueAt = new Date(values.dueAt);
      if (
        !identity ||
        dueAt >= identity.expiresAt ||
        dueAt.getTime() <= Date.now() + 5_000 ||
        dueAt.getTime() > Date.now() + 30 * 86_400_000
      )
        throw new DomainError(
          "SCHEDULE_TIME",
          "Choose a future time before your current session expires, within 30 days. Sign in again if needed.",
          422,
        );
      if (
        content.archivedAt ||
        variant.draftRevisionId !== values.expectedRevisionId
      )
        throw new DomainError(
          "REVISION_CONFLICT",
          "The saved draft changed. Reload before scheduling.",
          409,
        );
      if (variant.publishedRevisionId === values.expectedRevisionId)
        throw new DomainError(
          "ALREADY_PUBLISHED",
          "This saved revision is already published.",
          409,
        );
      const [active] = await tx
        .select()
        .from(cmsPublicationJob)
        .where(
          and(
            eq(cmsPublicationJob.variantId, variant.id),
            inArray(cmsPublicationJob.status, ["pending", "processing"]),
          ),
        );
      if ((active?.id ?? null) !== values.expectedJobId)
        throw new DomainError(
          "SCHEDULE_CONFLICT",
          "The publication schedule changed. Refresh before confirming.",
          409,
        );
      if (active)
        await tx
          .update(cmsPublicationJob)
          .set({
            status: "cancelled",
            finishedAt: new Date(),
            leaseToken: null,
            leaseExpiresAt: null,
            errorCode: "REPLACED",
          })
          .where(eq(cmsPublicationJob.id, active.id));
      await tx
        .insert(cmsPublicationJob)
        .values({
          organizationId,
          contentId: content.id,
          variantId: variant.id,
          revisionId: values.expectedRevisionId,
          publicationVersion: variant.publicationVersion,
          requestedBy: actor.userId,
          sessionId: actor.sessionId,
          requestId: values.requestId,
          dueAt,
          availableAt: dueAt,
        });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "cms.publication.scheduled",
        targetId: content.id,
      });
    });
    return this.workspace(actor, values.id, values.locale);
  }
  async cancel(actor: TrustedActor, input: unknown) {
    const values = publicationCancelInput.parse(input);
    await this.db.transaction(async (tx) => {
      await this.scope.lock(actor, values.id, "cms.publish", tx);
      const { organizationId, variant } = await this.target(
        actor,
        values.id,
        values.locale,
        tx,
      );
      const [job] = await tx
        .select()
        .from(cmsPublicationJob)
        .where(
          and(
            eq(cmsPublicationJob.id, values.jobId),
            eq(cmsPublicationJob.variantId, variant.id),
            eq(cmsPublicationJob.organizationId, organizationId),
          ),
        );
      if (!job)
        throw new DomainError(
          "SCHEDULE_NOT_FOUND",
          "Publication schedule is unavailable.",
          404,
        );
      if (job.status === "cancelled") return;
      if (job.status !== "pending" && job.status !== "processing")
        throw new DomainError(
          "SCHEDULE_FINISHED",
          "This schedule has finished. Refresh to see its result.",
          409,
        );
      await tx
        .update(cmsPublicationJob)
        .set({
          status: "cancelled",
          finishedAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          errorCode: "CANCELLED",
        })
        .where(eq(cmsPublicationJob.id, job.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "cms.publication.cancelled",
        targetId: values.id,
      });
    });
    return this.workspace(actor, values.id, values.locale);
  }
}
