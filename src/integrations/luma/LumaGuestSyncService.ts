import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lumaApiEvent, lumaSyncRun } from "../../../db/schema/luma-sync";
import { AuditRepository } from "../../core/audit/AuditRepository";
import { RequestLimiter } from "../../core/RequestLimiter";
import {
  DomainError,
  type TrustedActor,
  type DatabaseExecutor,
  type ResolveScheduledActor,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "../../features/events/EventService";
import { LumaClient, LumaRequestError } from "./LumaClient";
import { LumaConnectionAccess } from "./LumaConnectionAccess";
import { LumaEventSyncAccess } from "./LumaEventSyncAccess";
import { LumaSyncRepository } from "./LumaSyncRepository";
import { LumaSourceAccess } from "./LumaSourceAccess";
import { syncRequestSchema } from "./sync_schemas";

/** Internal worker lease checks, composed with the existing reconciliation transaction. */
export type SyncExecution = {
  guard: (db: DatabaseExecutor) => Promise<void>;
  started: (linkVersion: number, tx: Transaction) => Promise<void>;
  complete: (tx: Transaction) => Promise<void>;
};

/** One bounded, deliberate reconciliation. No provider writes or background promises. */
export class LumaGuestSyncService {
  private readonly records = new LumaSyncRepository();
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
    private readonly access: LumaEventSyncAccess,
    private readonly connection: LumaConnectionAccess,
    private readonly client: LumaClient,
    private readonly resolveActor: ResolveScheduledActor,
  ) {}
  private async identity(actor: TrustedActor) {
    const current = await this.resolveActor(actor.sessionId, actor.userId);
    if (
      !current ||
      current.expiresAt.getTime() <= Date.now() ||
      current.actor.userId !== actor.userId ||
      current.actor.sessionId !== actor.sessionId
    )
      throw new DomainError(
        "SYNC_ACCESS_CHANGED",
        "The requesting session is no longer available. Sign in again.",
        401,
      );
    return current.actor;
  }
  private async guard(
    actor: TrustedActor,
    eventId: string,
    expected: {
      organizationId: string;
      linkVersion: number;
      connectionId: string;
      connectionVersion: number;
      sourceId: string;
      sourceVersion: number;
    },
    db: DatabaseExecutor,
    execution?: SyncExecution,
  ) {
    await execution?.guard(db);
    const scope = await this.access.ready(
      await this.identity(actor),
      eventId,
      db,
      undefined,
      expected.sourceId,
    );
    if (scope.organizationId !== expected.organizationId)
      throw new DomainError("SYNC_UNAVAILABLE", "Event scope changed.", 409);
    const row = await this.records.link(
      scope.organizationId,
      eventId,
      db,
      expected.sourceId,
    );
    if (
      !row?.enabled ||
      row.version !== expected.linkVersion ||
      scope.sourceVersion !== expected.sourceVersion
    )
      throw new DomainError(
        "API_LINK_CHANGED",
        "Reconciliation was disabled or replaced. Retained records are unchanged.",
        409,
      );
    await this.connection.assertCurrent(
      scope.organizationId,
      expected.connectionId,
      expected.connectionVersion,
      db,
    );
    return scope;
  }
  async reconcile(
    actor: TrustedActor,
    eventId: string,
    input: unknown,
    execution?: SyncExecution,
  ) {
    z.uuid().parse(eventId);
    const values = syncRequestSchema.parse(input);
    actor = await this.identity(actor);
    const pending = await this.db.transaction(async (tx) => {
      await this.events.lockEvent(actor, eventId, tx);
      await execution?.guard(tx);
      const { organizationId } = await this.access.scope(actor, eventId, tx);
      const source = await new LumaSourceAccess().selection(
        organizationId,
        eventId,
        tx,
        values.sourceId,
      );
      if (!source)
        throw new DomainError(
          "SYNC_UNAVAILABLE",
          "Choose a published registration destination before reconciling.",
          409,
        );
      const [existing] = await tx
        .select({ id: lumaSyncRun.id, sourceId: lumaSyncRun.sourceId })
        .from(lumaSyncRun)
        .where(
          and(
            eq(lumaSyncRun.eventId, eventId),
            eq(lumaSyncRun.requestId, values.requestId),
          ),
        );
      if (existing) {
        if (existing.sourceId !== source.id)
          throw new DomainError(
            "SYNC_REPLAY_CONFLICT",
            "This reconciliation request belongs to a different source.",
            409,
          );
        return { replay: true as const, organizationId, sourceId: source.id };
      }
      const scope = await this.access.ready(
        actor,
        eventId,
        tx,
        undefined,
        source.id,
      );
      const row = await this.records.link(
        organizationId,
        eventId,
        tx,
        source.id,
      );
      if (!row?.enabled || row.version !== values.expectedVersion)
        throw new DomainError(
          "API_LINK_CHANGED",
          "Reload the enabled API event link before reconciling.",
          409,
        );
      if (row.attemptedAt && Date.now() - row.attemptedAt.getTime() < 60_000)
        throw new DomainError(
          "SYNC_RATE_LIMITED",
          "Wait one minute between reconciliations of this source.",
          429,
        );
      const connection = await this.connection.capture(organizationId, tx);
      if (connection.id !== row.connectionId)
        throw new DomainError(
          "CONNECTION_CHANGED",
          "The selected connection changed.",
          409,
        );
      // A previous process may have stopped. Its version becomes invalid before retry.
      await tx
        .update(lumaSyncRun)
        .set({
          status: "interrupted",
          errorCode: "SYNC_INTERRUPTED",
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(lumaSyncRun.eventId, eventId),
            eq(lumaSyncRun.sourceId, source.id),
            eq(lumaSyncRun.status, "running"),
          ),
        );
      const id = randomUUID(),
        version = row.version + 1;
      await tx
        .update(lumaApiEvent)
        .set({ version, attemptedAt: new Date() })
        .where(
          and(
            eq(lumaApiEvent.eventId, eventId),
            eq(lumaApiEvent.sourceId, source.id),
          ),
        );
      await execution?.started(version, tx);
      await tx.insert(lumaSyncRun).values({
        id,
        organizationId,
        eventId,
        sourceId: source.id,
        requestId: values.requestId,
        status: "running",
      });
      await this.records.prune(organizationId, eventId, tx, source.id);
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "integration.luma.sync_requested",
        targetId: eventId,
      });
      return {
        replay: false as const,
        ...scope,
        id,
        providerEventId: row.providerEventId,
        connection,
        linkVersion: version,
        connectionId: connection.id,
        connectionVersion: connection.version,
      };
    });
    if (pending.replay)
      return this.records.history(
        pending.organizationId,
        eventId,
        this.db,
        pending.sourceId,
      );
    try {
      const signal = AbortSignal.timeout(25_000);
      await this.guard(actor, eventId, pending, this.db, execution);
      await new RequestLimiter(this.db).consume(
        "luma-api",
        pending.organizationId,
        120,
      );
      const remote = await this.client.event(
        pending.connection.apiKey,
        pending.providerEventId,
        signal,
      );
      this.access.match(remote, {
        eventId: pending.providerEventId,
        calendarId: pending.connection.calendarId,
        url: pending.url,
      });
      const guests = await this.client.guests(
        pending.connection.apiKey,
        pending.providerEventId,
        signal,
        async () => {
          await this.guard(actor, eventId, pending, this.db, execution);
          await new RequestLimiter(this.db).consume(
            "luma-api",
            pending.organizationId,
            120,
          );
        },
      );
      await this.db.transaction(async (tx) => {
        await this.events.lockEvent(actor, eventId, tx);
        await this.guard(actor, eventId, pending, tx, execution);
        const [run] = await tx
          .select()
          .from(lumaSyncRun)
          .where(eq(lumaSyncRun.id, pending.id));
        if (run?.status !== "running")
          throw new DomainError(
            "SYNC_UNAVAILABLE",
            "This reconciliation is no longer current.",
            409,
          );
        await this.records.reconcile(
          pending.organizationId,
          eventId,
          pending.id,
          guests,
          tx,
          pending.sourceId,
        );
        await execution?.complete(tx);
        await tx
          .update(lumaSyncRun)
          .set({
            status: "succeeded",
            finishedAt: new Date(),
            guestCount: guests.length,
          })
          .where(eq(lumaSyncRun.id, pending.id));
        await this.audit.record(tx, {
          organizationId: pending.organizationId,
          actorUserId: actor.userId,
          action: "integration.luma.sync_succeeded",
          targetId: eventId,
        });
      });
    } catch (error) {
      const code =
        error instanceof LumaRequestError
          ? error.code
          : error instanceof DomainError && error.code === "EVENT_MISMATCH"
            ? "EVENT_MISMATCH"
            : "SYNC_FAILED";
      // Updating this invocation's run receipt cannot mutate guests or reactivate a connection.
      await this.db
        .update(lumaSyncRun)
        .set({ status: "failed", errorCode: code, finishedAt: new Date() })
        .where(
          and(
            eq(lumaSyncRun.id, pending.id),
            eq(lumaSyncRun.status, "running"),
          ),
        );
      if (execution) throw error;
    }
    await this.access.scope(await this.identity(actor), eventId, this.db);
    return this.records.history(
      pending.organizationId,
      eventId,
      this.db,
      pending.sourceId,
    );
  }
}
