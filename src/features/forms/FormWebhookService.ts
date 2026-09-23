import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  formWebhook,
  formWebhookDelivery,
} from "../../../db/schema/form-webhooks";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { CredentialCipher } from "../../infrastructure/security/CredentialCipher";
import { FormScopePolicy } from "./FormScopePolicy";
import { webhookSaveSchema, type WebhookSettings } from "./webhook_schemas";

export class FormWebhookService {
  private readonly scope: FormScopePolicy;
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    authorization: AuthorizationService,
    private readonly cipher: CredentialCipher,
    private readonly deliveryEnabled: boolean,
  ) {
    this.scope = new FormScopePolicy(db, authorization);
  }
  async settings(
    actor: TrustedActor,
    formId: string,
  ): Promise<WebhookSettings> {
    z.uuid().parse(formId);
    const { organizationId } = await this.scope.require(
      actor,
      formId,
      "settings",
    );
    const [current] = await this.db
      .select()
      .from(formWebhook)
      .where(
        and(
          eq(formWebhook.formId, formId),
          eq(formWebhook.organizationId, organizationId),
        ),
      );
    const deliveries = await this.db
      .select({
        id: formWebhookDelivery.id,
        submissionId: formWebhookDelivery.submissionId,
        status: formWebhookDelivery.status,
        attempts: formWebhookDelivery.attempts,
        errorCode: formWebhookDelivery.lastErrorCode,
        createdAt: formWebhookDelivery.createdAt,
      })
      .from(formWebhookDelivery)
      .where(
        and(
          eq(formWebhookDelivery.formId, formId),
          eq(formWebhookDelivery.organizationId, organizationId),
        ),
      )
      .orderBy(desc(formWebhookDelivery.createdAt))
      .limit(20);
    return {
      configured: Boolean(current),
      endpoint: current?.endpoint ?? "",
      enabled: current?.enabled ?? false,
      revision: current?.revision ?? 0,
      secretConfigured: Boolean(current?.secret),
      deliveryEnabled: this.deliveryEnabled,
      deliveries: deliveries.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
      })),
    };
  }
  async save(actor: TrustedActor, formId: string, input: unknown) {
    z.uuid().parse(formId);
    const values = webhookSaveSchema.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId, current: configured } = await this.scope.lock(
        actor,
        formId,
        "settings",
        tx,
      );
      if (configured.archived)
        throw new DomainError(
          "FORM_ARCHIVED",
          "Restore this form before changing delivery.",
          409,
        );
      const [current] = await tx
        .select()
        .from(formWebhook)
        .where(
          and(
            eq(formWebhook.formId, formId),
            eq(formWebhook.organizationId, organizationId),
          ),
        );
      if ((current?.revision ?? 0) !== values.expectedRevision)
        throw new DomainError(
          "WEBHOOK_CHANGED",
          "Reload the current webhook settings before saving.",
          409,
        );
      const id = current?.id ?? randomUUID();
      if (!current && !values.secret)
        throw new DomainError(
          "WEBHOOK_SECRET_REQUIRED",
          "Enter a signing secret of at least 32 characters.",
          422,
        );
      const secret = values.secret
        ? this.cipher.seal(
            values.secret,
            `form-webhook:${organizationId}:${id}`,
          )
        : current!.secret;
      const next = {
        endpoint: values.endpoint,
        enabled: values.enabled,
        secret,
        revision: values.expectedRevision + 1,
        updatedAt: new Date(),
      };
      if (current)
        await tx.update(formWebhook).set(next).where(eq(formWebhook.id, id));
      else
        await tx
          .insert(formWebhook)
          .values({ ...next, id, formId, organizationId });
      // A reviewed destination change or pause never sends an old response to a new target.
      await tx
        .update(formWebhookDelivery)
        .set({
          status: "cancelled",
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: "CONFIGURATION_CHANGED",
        })
        .where(
          and(
            eq(formWebhookDelivery.webhookId, id),
            inArray(formWebhookDelivery.status, [
              "pending",
              "processing",
              "failed",
            ]),
          ),
        );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "form.webhook.configured",
        targetId: formId,
      });
    });
    return this.settings(actor, formId);
  }

  async retry(actor: TrustedActor, formId: string, input: unknown) {
    z.uuid().parse(formId);
    const { deliveryId } = z
      .object({ deliveryId: z.uuid() })
      .strict()
      .parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.scope.lock(
        actor,
        formId,
        "settings",
        tx,
      );
      const [hook] = await tx
        .select()
        .from(formWebhook)
        .where(
          and(
            eq(formWebhook.formId, formId),
            eq(formWebhook.organizationId, organizationId),
            eq(formWebhook.enabled, true),
          ),
        );
      if (!hook)
        throw new DomainError(
          "WEBHOOK_PAUSED",
          "Enable the current webhook before retrying.",
          409,
        );
      const rows = await tx
        .update(formWebhookDelivery)
        .set({
          status: "pending",
          attempts: 0,
          reviewedAt: sql`clock_timestamp()`,
          availableAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
        })
        .where(
          and(
            eq(formWebhookDelivery.id, deliveryId),
            eq(formWebhookDelivery.formId, formId),
            eq(formWebhookDelivery.organizationId, organizationId),
            eq(formWebhookDelivery.webhookId, hook.id),
            eq(formWebhookDelivery.revision, hook.revision),
            eq(formWebhookDelivery.status, "failed"),
          ),
        )
        .returning({ id: formWebhookDelivery.id });
      if (!rows.length)
        throw new DomainError(
          "WEBHOOK_RETRY_UNAVAILABLE",
          "Only failed deliveries for this current destination can be retried.",
          409,
        );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "form.webhook.retried",
        targetId: deliveryId,
      });
    });
    return this.settings(actor, formId);
  }
}
