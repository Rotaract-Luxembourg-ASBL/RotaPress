import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/client";
import type { WebhookSender } from "../../infrastructure/http/WebhookClient";
import type { CredentialCipher } from "../../infrastructure/security/CredentialCipher";
import {
  eventDeliveryAllowed,
  featureDeliveryAllowed,
} from "./form_delivery_policy";

const eligible = sql`exists (
  select 1 from club.form_webhook hook join club.form configured
    on configured.id = hook.form_id and configured.organization_id = hook.organization_id
  where hook.id = delivery.webhook_id and hook.organization_id = delivery.organization_id
    and hook.enabled and hook.revision = delivery.revision
    and ${eventDeliveryAllowed(sql`delivery.reviewed_at`)} and ${featureDeliveryAllowed(sql`delivery.reviewed_at`)}
)`;
type Job = {
  id: string;
  formId: string;
  submissionId: string;
  organizationId: string;
  webhookId: string;
};

export class FormWebhookRunner {
  constructor(
    private readonly db: Database,
    private readonly cipher: CredentialCipher,
    private readonly sender: WebhookSender,
    private readonly appUrl: string,
  ) {}

  async runBatch(limit = 5) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error("INVALID_JOB_BATCH_SIZE");
    const result = {
      processed: 0,
      sent: 0,
      deferred: 0,
      deliveryEnabled: this.sender.enabled,
    };
    await this.db
      .execute(sql`update club.form_webhook_delivery delivery set status = 'cancelled',
      lease_token = null, lease_expires_at = null, last_error_code = 'DELIVERY_NO_LONGER_AUTHORIZED'
      where status in ('pending', 'processing') and not (${eligible})`);
    await this.db
      .execute(sql`update club.form_webhook_delivery set status = 'failed',
      lease_token = null, lease_expires_at = null, last_error_code = 'DELIVERY_ATTEMPTS_EXHAUSTED'
      where attempts >= 5 and (status = 'pending' or (status = 'processing' and lease_expires_at <= now()))`);
    if (!this.sender.enabled) return result;
    for (let index = 0; index < limit; index++) {
      const token = randomUUID();
      const claimed = await this.db.execute<Job>(sql`with candidate as (
        select id from club.form_webhook_delivery delivery where attempts < 5
          and ((status = 'pending' and available_at <= now()) or (status = 'processing' and lease_expires_at <= now()))
          and ${eligible} order by created_at for update skip locked limit 1
      ) update club.form_webhook_delivery delivery set status = 'processing', attempts = attempts + 1,
        lease_token = ${token}, lease_expires_at = now() + interval '2 minutes'
        from candidate where delivery.id = candidate.id
        returning delivery.id, delivery.form_id as "formId", delivery.submission_id as "submissionId",
          delivery.organization_id as "organizationId", delivery.webhook_id as "webhookId"`);
      const job = claimed.rows[0];
      if (!job) break;
      result.processed++;
      const current = await this.db.execute<{
        endpoint: string;
        secret: string;
        kind: string;
        eventId: string | null;
        versionId: string;
        createdAt: string;
      }>(sql`
        select hook.endpoint, hook.secret, configured.kind, configured.event_id as "eventId",
          response.version_id as "versionId", response.created_at::text as "createdAt"
        from club.form_webhook_delivery delivery
        join club.form_webhook hook on hook.id = delivery.webhook_id
        join club.form configured on configured.id = delivery.form_id
        join club.form_submission response on response.id = delivery.submission_id
        where delivery.id = ${job.id} and delivery.lease_token = ${token} and delivery.status = 'processing' and ${eligible}`);
      const target = current.rows[0];
      if (!target) {
        await this.finish(
          job.id,
          token,
          false,
          "DELIVERY_NO_LONGER_AUTHORIZED",
          true,
        );
        result.deferred++;
        continue;
      }
      let sent = false;
      try {
        const body = JSON.stringify({
          id: job.id,
          type:
            target.kind === "registration"
              ? "event.registration.created"
              : "form.response.created",
          createdAt: new Date(target.createdAt).toISOString(),
          data: {
            formId: job.formId,
            submissionId: job.submissionId,
            versionId: target.versionId,
            eventId: target.eventId,
            url: new URL(
              `/admin/forms/${job.formId}/submissions/${job.submissionId}`,
              this.appUrl,
            ).href,
          },
        });
        const timestamp = String(Math.floor(Date.now() / 1000));
        const secret = this.cipher.open(
          target.secret,
          `form-webhook:${job.organizationId}:${job.webhookId}`,
        );
        const signature = createHmac("sha256", secret)
          .update(`${timestamp}.${body}`)
          .digest("hex");
        await this.sender.send(target.endpoint, body, {
          "x-rotapress-id": job.id,
          "x-rotapress-timestamp": timestamp,
          "x-rotapress-signature": `v1=${signature}`,
        });
        sent = true;
      } catch {
        /* Store only stable codes; destination errors and credentials stay private. */
      }
      await this.finish(
        job.id,
        token,
        sent,
        sent ? null : "WEBHOOK_DELIVERY_FAILED",
      );
      if (sent) result.sent++;
      else result.deferred++;
    }
    return result;
  }

  private async finish(
    id: string,
    token: string,
    sent: boolean,
    code: string | null,
    cancelled = false,
  ) {
    await this.db.execute(sql`update club.form_webhook_delivery set
      status = case when ${cancelled} then 'cancelled' when ${sent} then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
      sent_at = case when ${sent} then now() else null end, last_error_code = ${code},
      available_at = now() + least(3600, power(2, attempts) * 30) * interval '1 second',
      lease_token = null, lease_expires_at = null where id = ${id} and lease_token = ${token} and status = 'processing'`);
  }
}
