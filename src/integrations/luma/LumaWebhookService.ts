import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { organization } from "../../../db/schema/club";
import { lumaApiEvent } from "../../../db/schema/luma-sync";
import { eventPackageSource } from "../../../db/schema/event-packages";
import {
  lumaWebhook,
  lumaWebhookReceipt as receipts,
} from "../../../db/schema/luma-webhooks";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { CredentialCipher } from "./CredentialCipher";
import { LumaAvailabilityService } from "./LumaAvailabilityService";
import { verifyLumaWebhook } from "./LumaWebhookSignature";
import { providerEventIdSchema } from "./sync_schemas";
import {
  webhookActionSchema,
  webhookEventTypes,
  webhookSaveSchema,
  type LumaWebhookDto,
} from "./webhook_schemas";

export class LumaWebhookService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly availability: LumaAvailabilityService,
    private readonly cipher: CredentialCipher,
    private readonly appUrl: string,
  ) {}

  private async row(organizationId: string, executor: DatabaseExecutor) {
    const [row] = await executor
      .select()
      .from(lumaWebhook)
      .where(eq(lumaWebhook.organizationId, organizationId));
    return row;
  }
  private async projection(
    organizationId: string,
    executor: DatabaseExecutor,
  ): Promise<LumaWebhookDto> {
    const row = await this.row(organizationId, executor);
    const recent = row
      ? await executor
          .select({
            id: receipts.id,
            eventType: receipts.eventType,
            receivedAt: receipts.receivedAt,
            eventId: lumaApiEvent.eventId,
            sourceId: lumaApiEvent.sourceId,
            sourceLabel: eventPackageSource.label,
          })
          .from(receipts)
          .leftJoin(
            lumaApiEvent,
            and(
              eq(lumaApiEvent.organizationId, organizationId),
              eq(lumaApiEvent.providerEventId, receipts.providerEventId),
            ),
          )
          .leftJoin(
            eventPackageSource,
            and(
              eq(eventPackageSource.id, lumaApiEvent.sourceId),
              eq(eventPackageSource.eventId, lumaApiEvent.eventId),
              eq(eventPackageSource.organizationId, organizationId),
            ),
          )
          .where(
            and(
              eq(receipts.webhookId, row.id),
              gte(
                receipts.receivedAt,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ),
            ),
          )
          .orderBy(desc(receipts.receivedAt))
          .limit(10)
      : [];
    return {
      version: row?.version ?? 0,
      callbackUrl: row
        ? new URL(`/api/webhooks/luma/${row.id}`, this.appUrl).href
        : null,
      hasSecret: Boolean(row?.secret),
      enabled: row?.enabled ?? false,
      allowed:
        (await this.availability.enabled(organizationId, executor)) &&
        (await this.authorization.features.enabled(
          organizationId,
          "events",
          executor,
        )),
      encryptionReady: this.cipher.ready,
      localOnly: ["127.0.0.1", "localhost", "[::1]"].includes(
        new URL(this.appUrl).hostname,
      ),
      eventTypes: z
        .array(z.enum(webhookEventTypes))
        .parse(row?.eventTypes ?? []),
      receipts: recent.map((r) => ({
        ...r,
        eventType: z.enum(webhookEventTypes).parse(r.eventType),
        receivedAt: r.receivedAt.toISOString(),
      })),
    };
  }
  async workspace(actor: TrustedActor) {
    const { organizationId } = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    return this.projection(organizationId, this.db);
  }
  async configure(
    actor: TrustedActor,
    operation: "generate" | "save" | "pause" | "remove",
    input: unknown,
  ) {
    const values =
      operation === "save"
        ? webhookSaveSchema.parse(input)
        : webhookActionSchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "integrations.manage",
        tx,
      );
      const row = await this.row(organizationId, tx);
      if ((row?.version ?? 0) !== values.expectedVersion)
        throw new DomainError(
          "WEBHOOK_CHANGED",
          "Reload the current webhook settings before confirming.",
          409,
        );
      if (operation === "generate") {
        if (!row) await tx.insert(lumaWebhook).values({ organizationId });
      } else {
        if (!row)
          throw new DomainError(
            "WEBHOOK_MISSING",
            "Generate the callback URL first.",
            409,
          );
        if (operation === "save") {
          const save = webhookSaveSchema.parse(values);
          if (!(await this.availability.enabled(organizationId, tx)))
            throw new DomainError(
              "LUMA_DISABLED",
              "Enable Luma before enabling webhook reception.",
              409,
            );
          await this.authorization.features.require(
            organizationId,
            "events",
            tx,
          );
          const secret = save.secret
            ? this.cipher.seal(
                save.secret,
                `${organizationId}:${row.id}:webhook`,
              )
            : row.secret;
          if (!secret)
            throw new DomainError(
              "WEBHOOK_SECRET_REQUIRED",
              "Enter the signing secret generated by Luma.",
              400,
            );
          this.cipher.open(secret, `${organizationId}:${row.id}:webhook`);
          await tx
            .update(lumaWebhook)
            .set({
              secret,
              enabled: true,
              eventTypes: save.eventTypes,
              version: row.version + 1,
            })
            .where(eq(lumaWebhook.id, row.id));
        } else {
          await tx
            .update(lumaWebhook)
            .set({
              enabled: false,
              version: row.version + 1,
              ...(operation === "remove" ? { secret: null } : {}),
            })
            .where(eq(lumaWebhook.id, row.id));
        }
      }
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: `integration.luma.webhook_${operation}`,
        targetId: row?.id ?? organizationId,
      });
      return this.projection(organizationId, tx);
    });
  }

  /** A verified notification is an inbox signal, never an import or eligibility decision. */
  async receive(id: string, signature: string | null, body: Buffer) {
    if (!z.uuid().safeParse(id).success)
      throw new DomainError("WEBHOOK_UNKNOWN", "Webhook unavailable.", 404);
    if (body.length > 262_144)
      throw new DomainError(
        "WEBHOOK_TOO_LARGE",
        "Webhook body is too large.",
        413,
      );
    return this.db.transaction(async (tx) => {
      const [scope] = await tx
        .select({ organizationId: lumaWebhook.organizationId })
        .from(lumaWebhook)
        .where(eq(lumaWebhook.id, id));
      if (!scope)
        throw new DomainError("WEBHOOK_UNKNOWN", "Webhook unavailable.", 404);
      // Same lock order as activation and credential changes: disable/rotation wins serially.
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, scope.organizationId))
        .for("update");
      const row = await this.row(scope.organizationId, tx);
      if (
        !row?.enabled ||
        !row.secret ||
        !(await this.availability.enabled(scope.organizationId, tx)) ||
        !(await this.authorization.features.enabled(
          scope.organizationId,
          "events",
          tx,
        ))
      )
        throw new DomainError(
          "WEBHOOK_PAUSED",
          "Webhook reception is paused.",
          503,
        );
      const secret = this.cipher.open(
        row.secret,
        `${scope.organizationId}:${row.id}:webhook`,
      );
      if (!verifyLumaWebhook(secret, signature, body))
        throw new DomainError(
          "WEBHOOK_SIGNATURE",
          "Webhook verification failed.",
          401,
        );
      let decoded: unknown;
      try {
        decoded = JSON.parse(body.toString("utf8"));
      } catch {
        throw new DomainError(
          "WEBHOOK_PAYLOAD",
          "Webhook payload is invalid.",
          400,
        );
      }
      const payload = z
        .object({ type: z.string().max(80), data: z.unknown() })
        .safeParse(decoded);
      if (!payload.success)
        throw new DomainError(
          "WEBHOOK_PAYLOAD",
          "Webhook payload is invalid.",
          400,
        );
      if (!row.eventTypes.includes(payload.data.type))
        return { accepted: true };
      // Strip all fields except the provider event reference. Never persist guest payloads.
      const data = payload.data.type.startsWith("event.")
        ? z.object({ id: providerEventIdSchema }).safeParse(payload.data.data)
        : z
            .object({ event: z.object({ id: providerEventIdSchema }) })
            .transform((v) => v.event)
            .safeParse(payload.data.data);
      if (!data.success)
        throw new DomainError(
          "WEBHOOK_PAYLOAD",
          "Webhook payload is invalid.",
          400,
        );
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await tx
        .delete(receipts)
        .where(
          and(eq(receipts.webhookId, id), lt(receipts.receivedAt, cutoff)),
        );
      await tx
        .insert(receipts)
        .values({
          webhookId: id,
          eventType: payload.data.type,
          providerEventId: data.data.id,
          bodyHash: createHash("sha256").update(body).digest("hex"),
        })
        .onConflictDoNothing({
          target: [receipts.webhookId, receipts.bodyHash],
        });
      return { accepted: true };
    });
  }
}
