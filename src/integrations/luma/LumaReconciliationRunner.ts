import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { DomainError } from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { LumaRequestError } from "./LumaClient";
import { LumaGuestSyncService } from "./LumaGuestSyncService";
import { LumaReconciliationJobs } from "./LumaReconciliationJobs";

type Claim = {
  id: string;
  eventId: string;
  sourceId: string;
  sessionId: string;
  requestedBy: string;
  linkVersion: number;
};

/** Read-only provider reconciliation using the same bounded local worker as other jobs. */
export class LumaReconciliationRunner {
  constructor(
    private readonly db: Database,
    private readonly jobs: LumaReconciliationJobs,
    private readonly sync: LumaGuestSyncService,
  ) {}
  async runBatch(limit = 5) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error("INVALID_JOB_BATCH_SIZE");
    const result = {
      processed: 0,
      succeeded: 0,
      cancelled: 0,
      failed: 0,
      deferred: 0,
    };
    const exhausted = await this.db
      .execute(sql`UPDATE club.luma_reconciliation_job SET status = 'failed',
      finished_at = now(), lease_token = NULL, lease_expires_at = NULL, error_code = 'ATTEMPTS_EXHAUSTED'
      WHERE attempts >= 3 AND (status = 'pending' OR (status = 'processing' AND lease_expires_at <= now()))`);
    result.failed += exhausted.rowCount ?? 0;
    for (let index = 0; index < limit; index++) {
      const lease = randomUUID();
      const claimed = await this.db.execute<Claim>(sql`
        WITH candidate AS (
          SELECT id FROM club.luma_reconciliation_job
          WHERE attempts < 3 AND ((status = 'pending' AND available_at <= now())
            OR (status = 'processing' AND lease_expires_at <= now()))
          ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE club.luma_reconciliation_job AS job SET status = 'processing', attempts = job.attempts + 1,
          lease_token = ${lease}, lease_expires_at = now() + interval '2 minutes'
        FROM candidate WHERE job.id = candidate.id
        RETURNING job.id, job.event_id AS "eventId", job.source_id AS "sourceId", job.session_id AS "sessionId", job.requested_by AS "requestedBy", job.link_version AS "linkVersion"`);
      const job = claimed.rows[0];
      if (!job) break;
      result.processed++;
      try {
        const actor = await this.jobs.identity(job.sessionId, job.requestedBy);
        await this.sync.reconcile(
          actor,
          job.eventId,
          {
            sourceId: job.sourceId,
            expectedVersion: job.linkVersion,
            requestId: randomUUID(),
            confirmed: true,
          },
          this.jobs.execution(job.id, lease),
        );
        result.succeeded++;
      } catch (error) {
        const transient =
          error instanceof LumaRequestError
            ? [
                "REQUEST_FAILED",
                "RATE_LIMITED",
                "PROVIDER_UNAVAILABLE",
              ].includes(error.code)
            : error instanceof DomainError
              ? ["RATE_LIMITED", "SYNC_RATE_LIMITED"].includes(error.code)
              : true;
        if (transient) {
          const retry = await this.db.execute<{
            status: "pending" | "failed";
          }>(sql`
            UPDATE club.luma_reconciliation_job SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
              finished_at = CASE WHEN attempts >= 3 THEN now() ELSE NULL END,
              available_at = now() + interval '65 seconds', lease_token = NULL, lease_expires_at = NULL,
              error_code = CASE WHEN attempts >= 3 THEN 'ATTEMPTS_EXHAUSTED' ELSE 'RETRY_PENDING' END
            WHERE id = ${job.id} AND lease_token = ${lease} AND status = 'processing' RETURNING status`);
          if (retry.rows[0]?.status === "pending") result.deferred++;
          if (retry.rows[0]?.status === "failed") result.failed++;
        } else {
          const provider =
            error instanceof LumaRequestError ||
            (error instanceof DomainError && error.code === "EVENT_MISMATCH");
          const status = provider ? "failed" : "cancelled";
          const access =
            error instanceof DomainError &&
            [
              "SYNC_ACCESS_CHANGED",
              "ACCESS_DENIED",
              "EVENT_ACCESS_DENIED",
              "EVENT_NOT_FOUND",
              "GOOGLE_SESSION_REQUIRED",
              "AUTH_METHOD_REQUIRED",
              "VERIFIED_IDENTITY_REQUIRED",
            ].includes(error.code);
          const code = provider
            ? "PROVIDER_REJECTED"
            : access
              ? "ACCESS_CHANGED"
              : "CONFIGURATION_CHANGED";
          const changed = await this.db
            .execute(sql`UPDATE club.luma_reconciliation_job SET status = ${status},
            finished_at = now(), lease_token = NULL, lease_expires_at = NULL, error_code = ${code}
            WHERE id = ${job.id} AND lease_token = ${lease} AND status = 'processing'`);
          result[status] += changed.rowCount ?? 0;
        }
      }
    }
    return result;
  }
}
