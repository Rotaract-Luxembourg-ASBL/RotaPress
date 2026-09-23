import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lumaApiEvent } from "../../../db/schema/luma-sync";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  requireRecentActor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "../../features/events/EventService";
import { LumaConnectionAccess } from "./LumaConnectionAccess";
import { LumaEventSyncAccess } from "./LumaEventSyncAccess";
import { LumaClient, LumaRequestError } from "./LumaClient";
import { LumaSyncRepository } from "./LumaSyncRepository";
import { LumaSourceAccess } from "./LumaSourceAccess";
import { connectionMessages } from "./connection_schemas";
import { RequestLimiter } from "../../core/RequestLimiter";
import {
  apiLinkSchema,
  syncToggleSchema,
  type LumaSyncDto,
} from "./sync_schemas";

export class LumaApiEventService {
  private readonly records = new LumaSyncRepository();
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
    private readonly access: LumaEventSyncAccess,
    private readonly connection: LumaConnectionAccess,
    private readonly client: LumaClient,
  ) {}
  async workspace(
    actor: TrustedActor,
    eventId: string,
    sourceId?: string,
  ): Promise<LumaSyncDto> {
    const { organizationId, event } = await this.access.scope(
      actor,
      eventId,
      this.db,
    );
    const selection = new LumaSourceAccess();
    const source = await selection.selection(
      organizationId,
      eventId,
      this.db,
      sourceId,
    );
    const row = await this.records.link(
      organizationId,
      eventId,
      this.db,
      source?.id,
    );
    let reason: string | null = null;
    try {
      await this.access.ready(actor, eventId, this.db, undefined, source?.id);
      await this.connection.capture(organizationId, this.db);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      reason = error.message;
    }
    return {
      sourceId: source?.id ?? null,
      sources: await selection.list(organizationId, eventId, this.db),
      version: row?.version ?? 0,
      providerEventId: row?.providerEventId ?? null,
      enabled: row?.enabled ?? false,
      available: !reason,
      reason,
      canConfigure:
        event.capabilities.includes("events.publish") &&
        !event.archived &&
        !event.cancelled,
      mode: this.client.mode,
      lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
      ...(await this.records.guests(
        organizationId,
        eventId,
        this.db,
        source?.id,
      )),
      runs: await this.records.history(
        organizationId,
        eventId,
        this.db,
        source?.id,
      ),
    };
  }
  async link(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = apiLinkSchema.parse(input);
    requireRecentActor(actor);
    const pending = await this.db.transaction(async (tx) => {
      await this.events.lockEvent(actor, eventId, tx);
      const scope = await this.access.ready(
        actor,
        eventId,
        tx,
        "events.publish",
        values.sourceId,
      );
      const current = await this.records.link(
        scope.organizationId,
        eventId,
        tx,
        scope.sourceId,
      );
      if (current)
        throw new DomainError(
          "API_LINK_LOCKED",
          "This source already has an API identity. Use enable/disable to retain it; changing providers requires a migration.",
          409,
        );
      if (values.expectedVersion !== 0)
        throw new DomainError(
          "API_LINK_CHANGED",
          "Reload the API event link before confirming.",
          409,
        );
      const connection = await this.connection.capture(
        scope.organizationId,
        tx,
      );
      const [existing] = await tx
        .select({ id: lumaApiEvent.eventId })
        .from(lumaApiEvent)
        .where(
          and(
            eq(lumaApiEvent.connectionId, connection.id),
            eq(lumaApiEvent.providerEventId, values.providerEventId),
          ),
        );
      if (existing)
        throw new DomainError(
          "API_LINK_DUPLICATE",
          "This provider event is already linked to another local event.",
          409,
        );
      return { ...scope, connection };
    });
    let remote;
    try {
      await new RequestLimiter(this.db).consume(
        "luma-api",
        pending.organizationId,
        120,
      );
      remote = await this.client.event(
        pending.connection.apiKey,
        values.providerEventId,
      );
    } catch (error) {
      throw new DomainError(
        "API_EVENT_CHECK_FAILED",
        error instanceof LumaRequestError
          ? connectionMessages[error.code]
          : "The API event could not be checked.",
        409,
      );
    }
    await this.db.transaction(async (tx) => {
      await this.events.lockEvent(actor, eventId, tx);
      const scope = await this.access.ready(
        actor,
        eventId,
        tx,
        "events.publish",
        pending.sourceId,
      );
      await this.connection.assertCurrent(
        scope.organizationId,
        pending.connection.id,
        pending.connection.version,
        tx,
      );
      if (
        scope.sourceVersion !== pending.sourceVersion ||
        (await this.records.link(
          scope.organizationId,
          eventId,
          tx,
          pending.sourceId,
        ))
      )
        throw new DomainError(
          "API_LINK_CHANGED",
          "The API event link changed. Reload it before confirming.",
          409,
        );
      this.access.match(remote, {
        eventId: values.providerEventId,
        calendarId: pending.connection.calendarId,
        url: scope.url,
      });
      const duplicate = await tx
        .select({ id: lumaApiEvent.eventId })
        .from(lumaApiEvent)
        .where(
          and(
            eq(lumaApiEvent.connectionId, pending.connection.id),
            eq(lumaApiEvent.providerEventId, remote.id),
          ),
        );
      if (duplicate.length)
        throw new DomainError(
          "API_LINK_DUPLICATE",
          "This provider event is already linked to another local event.",
          409,
        );
      await tx.insert(lumaApiEvent).values({
        eventId,
        sourceId: pending.sourceId,
        organizationId: scope.organizationId,
        connectionId: pending.connection.id,
        providerEventId: remote.id,
      });
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "integration.luma.api_event_linked",
        targetId: eventId,
      });
    });
    return this.workspace(actor, eventId, pending.sourceId);
  }
  async configure(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = syncToggleSchema.parse(input);
    requireRecentActor(actor);
    await this.db.transaction(async (tx) => {
      await this.events.lockEvent(actor, eventId, tx);
      const { organizationId } = await this.access.scope(
        actor,
        eventId,
        tx,
        "events.publish",
      );
      const row = await this.records.link(
        organizationId,
        eventId,
        tx,
        values.sourceId,
      );
      if (!row || row.version !== values.expectedVersion)
        throw new DomainError(
          "API_LINK_CHANGED",
          "Reload the API event link before confirming.",
          409,
        );
      if (values.enabled) {
        await this.access.ready(actor, eventId, tx, undefined, row.sourceId);
        const connection = await this.connection.capture(organizationId, tx);
        if (connection.id !== row.connectionId)
          throw new DomainError(
            "CONNECTION_CHANGED",
            "The selected connection changed.",
            409,
          );
      }
      await tx
        .update(lumaApiEvent)
        .set({ enabled: values.enabled, version: row.version + 1 })
        .where(
          and(
            eq(lumaApiEvent.eventId, eventId),
            eq(lumaApiEvent.sourceId, row.sourceId),
          ),
        );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: values.enabled
          ? "integration.luma.sync_enabled"
          : "integration.luma.sync_disabled",
        targetId: eventId,
      });
    });
    return this.workspace(actor, eventId, values.sourceId);
  }
}
