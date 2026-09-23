import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "@/infrastructure/database/client";
import type { ApplicationMailer } from "@/infrastructure/email/ApplicationMailer";

import {
  eventDeliveryAllowed,
  featureDeliveryAllowed,
} from "./form_delivery_policy";

type ClaimedNotification = {
  id: string;
  recipient: string;
  submissionId: string;
  formId: string;
  organizationId: string;
  reviewedAt: string;
};

/** Bounded durable outbox consumer. SMTP is outside the submission transaction. */
export class FormNotificationRunner {
  constructor(
    private readonly db: Database,
    private readonly mailer: Pick<ApplicationMailer, "sendSubmissionNotification">,
    private readonly appUrl: string,
  ) {}

  async runBatch(limit = 5) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error("INVALID_JOB_BATCH_SIZE");
    const result = { processed: 0, sent: 0, deferred: 0 };
    await this.db.execute(sql`UPDATE club.form_notification AS notification SET
      status = 'failed', lease_token = NULL, lease_expires_at = NULL, last_error_code = 'FEATURE_DISABLED'
      WHERE status in ('pending', 'processing') AND EXISTS (
        SELECT 1 FROM club.form AS configured WHERE configured.id = notification.form_id
          AND configured.organization_id = notification.organization_id
          AND NOT (${featureDeliveryAllowed(sql`notification.reviewed_at`)} AND ${eventDeliveryAllowed(sql`notification.reviewed_at`)})
      )`);
    // Recipients come from current trusted settings, never public input. Keeping
    // an accepted submission through archival also keeps its delivery eligible.
    await this.db.execute(sql`UPDATE club.form_notification AS notification SET
      status = 'failed', lease_token = NULL, lease_expires_at = NULL,
      last_error_code = 'RECIPIENT_REMOVED'
      WHERE (status = 'pending' OR (status = 'processing' AND lease_expires_at <= now()))
      AND NOT EXISTS (
        SELECT 1 FROM club.form AS configured WHERE configured.id = notification.form_id
          AND configured.organization_id = notification.organization_id
          AND configured.recipients ? notification.recipient
      )`);
    // A worker may have stopped after its final SMTP attempt. Expired leases are
    // visible failures, never permanent 'processing' records or silent success.
    await this.db
      .execute(sql`UPDATE club.form_notification SET status = 'failed',
      lease_token = NULL, lease_expires_at = NULL, last_error_code = 'DELIVERY_ATTEMPTS_EXHAUSTED'
      WHERE attempts >= 5 AND ((status = 'processing' AND lease_expires_at <= now()) OR status = 'pending')`);
    for (let index = 0; index < limit; index++) {
      const leaseToken = randomUUID();
      const claimed = await this.db.execute<ClaimedNotification>(sql`
        WITH candidate AS (
          SELECT id FROM club.form_notification AS candidate_notification
          WHERE attempts < 5 AND ((status = 'pending' AND available_at <= now())
            OR (status = 'processing' AND lease_expires_at <= now()))
          AND EXISTS (
            SELECT 1 FROM club.form AS configured WHERE configured.id = candidate_notification.form_id
              AND configured.organization_id = candidate_notification.organization_id
              AND configured.recipients ? candidate_notification.recipient
              AND ${eventDeliveryAllowed(sql`candidate_notification.reviewed_at`)}
              AND ${featureDeliveryAllowed(sql`candidate_notification.reviewed_at`)}
          )
          ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE club.form_notification AS notification SET
          status = 'processing', attempts = notification.attempts + 1,
          lease_token = ${leaseToken}, lease_expires_at = now() + interval '2 minutes'
        FROM candidate WHERE notification.id = candidate.id
        RETURNING notification.id, notification.recipient,
          notification.submission_id AS "submissionId", notification.form_id AS "formId",
          notification.organization_id AS "organizationId", notification.reviewed_at::text AS "reviewedAt"`);
      const notification = claimed.rows[0];
      if (!notification) break;
      result.processed++;
      const current = await this.db.execute<{ allowed: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM club.form AS configured WHERE id = ${notification.formId}
            AND organization_id = ${notification.organizationId}
            AND recipients ? ${notification.recipient}
            AND ${eventDeliveryAllowed(sql`${notification.reviewedAt}::timestamptz`)}
            AND ${featureDeliveryAllowed(sql`${notification.reviewedAt}::timestamptz`)}
        ) AS allowed`);
      if (!current.rows[0]?.allowed) {
        await this.db
          .execute(sql`UPDATE club.form_notification SET status = 'pending', attempts = greatest(0, attempts - 1),
          available_at = now() + interval '1 minute', lease_token = NULL, lease_expires_at = NULL, last_error_code = 'DELIVERY_PAUSED'
          WHERE id = ${notification.id} AND lease_token = ${leaseToken} AND status = 'processing'`);
        result.deferred++;
        continue;
      }
      const link = new URL(
        `/admin/forms/${notification.formId}/submissions/${notification.submissionId}`,
        this.appUrl,
      ).href;
      let delivered = false;
      try {
        // Stable Message-ID assists mail clients; SMTP acknowledgements cannot
        // guarantee exactly-once delivery after a process or network failure.
        await this.mailer.sendSubmissionNotification(
          notification.recipient,
          link,
          `<form-${notification.id}@rotapress.local>`,
          notification.formId,
        );
        delivered = true;
      } catch {
        // Never persist raw SMTP exceptions, credentials, addresses or answers.
      }
      if (delivered) {
        await this.db
          .execute(sql`UPDATE club.form_notification SET status = 'sent', sent_at = now(),
          last_error_code = NULL, lease_token = NULL, lease_expires_at = NULL
          WHERE id = ${notification.id} AND lease_token = ${leaseToken}`);
        result.sent++;
      } else {
        await this.db.execute(sql`UPDATE club.form_notification SET
          status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
          available_at = now() + least(3600, power(2, attempts) * 30) * interval '1 second',
          last_error_code = 'MAIL_DELIVERY_UNAVAILABLE', lease_token = NULL, lease_expires_at = NULL
          WHERE id = ${notification.id} AND lease_token = ${leaseToken}`);
        result.deferred++;
      }
    }
    return result;
  }
}
