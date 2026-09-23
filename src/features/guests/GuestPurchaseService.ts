import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  lumaApiEvent,
  lumaGuestProjection,
} from "../../../db/schema/luma-sync";
import { eventPackageSource } from "../../../db/schema/event-packages";
import { lumaPurchaseRefresh } from "../../../db/schema/luma-purchases";
import type {
  EntryBooking,
  EntryPurchaseEvidence,
} from "../events/entry_schemas";
import { AuditRepository } from "../../core/audit/AuditRepository";
import { RequestLimiter } from "../../core/RequestLimiter";
import {
  DomainError,
  type DatabaseExecutor,
  type ResolveScheduledActor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { EventService } from "../events/EventService";
import type { EventModuleService } from "../events/EventModuleService";
import type { GuestAccessService } from "./GuestAccessService";
import type { LumaEventSyncAccess } from "../../integrations/luma/LumaEventSyncAccess";
import type { LumaConnectionAccess } from "../../integrations/luma/LumaConnectionAccess";
import { LumaClient } from "../../integrations/luma/LumaClient";
import {
  LumaPurchaseRepository,
  type PurchaseRefreshRecord,
} from "../../integrations/luma/LumaPurchaseRepository";
import { importedPurchaseDetailsSchema } from "../../integrations/luma/purchase_schemas";
import {
  purchaseRefreshSchema,
  type PurchaseOrder,
  type PurchaseView,
} from "./purchase_schemas";

/** Observed purchases and explicit portal grants are independent of paid/prize eligibility. */
export class GuestPurchaseService {
  private readonly records = new LumaPurchaseRepository();
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly guests: GuestAccessService,
    private readonly access: LumaEventSyncAccess,
    private readonly connection: LumaConnectionAccess,
    private readonly client: LumaClient,
    private readonly resolveActor: ResolveScheduledActor,
  ) {}

  private unavailable() {
    return new DomainError(
      "PURCHASE_UNAVAILABLE",
      "Purchase details are unavailable for this booking.",
      404,
    );
  }

  private async identity(actor: TrustedActor) {
    const resolved = await this.resolveActor(actor.sessionId, actor.userId);
    if (
      !resolved ||
      resolved.expiresAt.getTime() <= Date.now() ||
      resolved.actor.userId !== actor.userId ||
      resolved.actor.sessionId !== actor.sessionId
    )
      throw new DomainError(
        "PURCHASE_ACCESS_CHANGED",
        "Sign in again before refreshing purchase details.",
        401,
      );
    return resolved.actor;
  }

  private async target(
    db: DatabaseExecutor,
    org: string,
    eventId: string,
    guestId: string,
  ) {
    const [row] = await db
      .select({
        guest: lumaGuestProjection,
        source: eventPackageSource,
        api: lumaApiEvent,
      })
      .from(lumaGuestProjection)
      .innerJoin(
        eventPackageSource,
        and(
          eq(eventPackageSource.id, lumaGuestProjection.sourceId),
          eq(eventPackageSource.eventId, lumaGuestProjection.eventId),
          eq(
            eventPackageSource.organizationId,
            lumaGuestProjection.organizationId,
          ),
        ),
      )
      .innerJoin(
        lumaApiEvent,
        and(
          eq(lumaApiEvent.sourceId, lumaGuestProjection.sourceId),
          eq(lumaApiEvent.eventId, lumaGuestProjection.eventId),
          eq(lumaApiEvent.organizationId, lumaGuestProjection.organizationId),
        ),
      )
      .where(
        and(
          eq(lumaGuestProjection.id, guestId),
          eq(lumaGuestProjection.eventId, eventId),
          eq(lumaGuestProjection.organizationId, org),
        ),
      );
    if (!row) throw this.unavailable();
    return row;
  }

  private async available(db: DatabaseExecutor, row: PurchaseTarget) {
    if (!row.source.enabled || !row.api.enabled) throw this.unavailable();
    await this.modules.requireEnabled(
      row.guest.organizationId,
      row.guest.eventId,
      "registration",
      db,
    );
    const connection = await this.connection.capture(
      row.guest.organizationId,
      db,
    );
    if (connection.id !== row.api.connectionId) throw this.unavailable();
    return connection;
  }

  private async view(
    db: DatabaseExecutor,
    row: PurchaseTarget,
    refreshAllowed: boolean,
  ): Promise<PurchaseView> {
    const latest = await this.records.latest(
      db,
      row.guest.organizationId,
      row.guest.id,
    );
    const successful =
      latest?.status === "succeeded"
        ? latest
        : await this.records.latest(
            db,
            row.guest.organizationId,
            row.guest.id,
            true,
          );
    // An email change must not reveal an earlier person's financial records to a new grant.
    const held = await this.records.identityHeld(
      db,
      row.guest.organizationId,
      row.guest.id,
      successful?.version ?? 0,
    );
    const parsed =
      !held &&
      successful?.recipientEmail === row.guest.email.trim().toLowerCase()
        ? importedPurchaseDetailsSchema.safeParse(successful.snapshot)
        : null;
    const details =
      parsed?.success &&
      parsed.data.providerGuestId === row.guest.providerGuestId
        ? parsed.data
        : null;
    let current = Boolean(
      details &&
      successful &&
      latest?.id === successful.id &&
      successful.sourceVersion === row.source.version &&
      successful.apiVersion === row.api.version &&
      successful.guestObservedAt.getTime() === row.guest.observedAt.getTime() &&
      successful.mode === this.client.mode,
    );
    try {
      await this.available(db, row);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      current = false;
      refreshAllowed = false;
    }
    if (successful) {
      try {
        await this.connection.assertCurrent(
          row.guest.organizationId,
          successful.connectionId,
          successful.connectionVersion,
          db,
        );
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        current = false;
      }
    }
    const status: PurchaseView["status"] = !latest
      ? "never"
      : latest.status === "failed"
        ? "failed"
        : latest.status === "running" &&
            Date.now() - latest.startedAt.getTime() < 30_000
          ? "running"
          : current
            ? "observed"
            : "stale";
    return {
      version: latest?.version ?? 0,
      mode: successful?.mode ?? this.client.mode,
      status,
      observedAt: details ? successful!.finishedAt!.toISOString() : null,
      attemptedAt: latest?.startedAt.toISOString() ?? null,
      receiptId: details ? successful!.id : null,
      orders:
        details?.orders.map(({ providerOrderId, ...order }) => ({
          ...order,
          reference: providerOrderId,
          state: this.orderState(order),
        })) ?? [],
      tickets:
        details?.tickets.map((ticket) => ({
          name: ticket.name,
          amount: ticket.amount,
          discount: ticket.discount,
          tax: ticket.tax,
          currency: ticket.currency,
          captured: ticket.captured,
        })) ?? [],
      receiptUrl: details ? "https://luma.com/settings/payment" : null,
      refreshAllowed,
    };
  }

  /** Private contract for the demo entry register; no provider requests or inferred rights. */
  async entryBookings(
    actor: TrustedActor,
    eventId: string,
    db: DatabaseExecutor,
  ): Promise<EntryBooking[]> {
    const event = await this.events.detail(actor, eventId, db);
    this.events.requireCapability(event, "events.entries.manage");
    // A live connection is never offered as demonstration evidence.
    if (this.client.mode !== "fixture") return [];
    const rows = await db
      .selectDistinct({
        id: lumaGuestProjection.id,
        label: lumaGuestProjection.name,
      })
      .from(lumaGuestProjection)
      .innerJoin(
        lumaPurchaseRefresh,
        and(
          eq(lumaPurchaseRefresh.guestId, lumaGuestProjection.id),
          eq(lumaPurchaseRefresh.eventId, lumaGuestProjection.eventId),
          eq(
            lumaPurchaseRefresh.organizationId,
            lumaGuestProjection.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(lumaGuestProjection.eventId, eventId),
          eq(lumaPurchaseRefresh.mode, "fixture"),
          eq(lumaPurchaseRefresh.status, "succeeded"),
        ),
      )
      .orderBy(lumaGuestProjection.id)
      .limit(1000);
    return rows.map((row) => ({
      id: row.id,
      label: row.label?.slice(0, 100) || "Test booking",
    }));
  }

  async entryEvidence(
    actor: TrustedActor,
    organizationId: string,
    eventId: string,
    guestId: string,
    db: DatabaseExecutor,
  ): Promise<EntryPurchaseEvidence> {
    const event = await this.events.detail(actor, eventId, db);
    this.events.requireCapability(event, "events.entries.manage");
    const row = await this.target(
      db,
      organizationId,
      eventId,
      z.uuid().parse(guestId),
    );
    const details = await this.view(db, row, false);
    return {
      guestId: row.guest.id,
      label: row.guest.name?.slice(0, 100) || "Test booking",
      approved: row.guest.present && row.guest.approvalStatus === "approved",
      receiptId: details.receiptId,
      version: details.version,
      mode: details.mode,
      status: details.status,
      orders: details.orders,
    };
  }

  private orderState(order: {
    amount: number;
    refunded: number;
    captured: boolean;
  }): PurchaseOrder["state"] {
    if (!order.amount) return "free";
    if (!order.captured) return "uncaptured";
    if (order.refunded === order.amount) return "refunded";
    return order.refunded ? "partly_refunded" : "captured";
  }

  async workspace(
    actor: TrustedActor,
    rawEventId: unknown,
    rawGuestId: unknown,
  ) {
    const eventId = z.uuid().parse(rawEventId),
      guestId = z.uuid().parse(rawGuestId);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      this.events.requireCapability(event, "events.responses.manage");
      return this.view(
        tx,
        await this.target(tx, organizationId, eventId, guestId),
        true,
      );
    });
  }

  async mine(actor: TrustedActor, rawEventId: unknown, rawGrantId: unknown) {
    const eventId = z.uuid().parse(rawEventId),
      grantId = z.uuid().parse(rawGrantId);
    return this.db.transaction(async (tx) => {
      const scope = await this.guests.purchaseScope(
        actor,
        eventId,
        grantId,
        tx,
      );
      const row = await this.target(
        tx,
        scope.organizationId,
        eventId,
        scope.guestId,
      );
      // Portal booking history retains its existing behavior; purchase delivery has its own availability gate.
      await this.available(tx, row);
      return this.view(tx, row, false);
    });
  }

  async receipt(actor: TrustedActor, eventId: unknown, grantId: unknown) {
    const view = await this.mine(actor, eventId, grantId);
    if (!view.receiptId) throw this.unavailable();
    return [
      "Private purchase summary",
      view.mode === "fixture"
        ? "Synthetic local provider data. No real payment is verified."
        : "Saved observations from Luma.",
      "This is a purchase summary, not a payment receipt or tax invoice.",
      "For official receipts, sign in to https://luma.com/settings/payment.",
      "Amounts are in the currency's minor units. Orders and tickets are separate provider records.",
      "No club membership, admission, payment or prize entitlement is issued by this summary.",
      JSON.stringify(
        {
          reference: view.receiptId,
          status: view.status,
          observedAt: view.observedAt,
          orders: view.orders,
          tickets: view.tickets,
        },
        null,
        2,
      ),
    ].join("\n\n");
  }

  private async guard(
    actor: TrustedActor,
    row: PurchaseRefreshRecord,
    eventVersion: number,
    db: DatabaseExecutor,
  ) {
    const scope = await this.access.scope(
      await this.identity(actor),
      row.eventId,
      db,
    );
    const target = await this.target(
      db,
      scope.organizationId,
      row.eventId,
      row.guestId,
    );
    if (
      scope.organizationId !== row.organizationId ||
      scope.event.version !== eventVersion ||
      target.source.version !== row.sourceVersion ||
      target.api.version !== row.apiVersion ||
      target.guest.observedAt.getTime() !== row.guestObservedAt.getTime() ||
      target.guest.email.trim().toLowerCase() !== row.recipientEmail
    )
      throw new DomainError(
        "PURCHASE_CHANGED",
        "Booking or source details changed. Review a new refresh.",
        409,
      );
    await this.available(db, target);
    await this.connection.assertCurrent(
      row.organizationId,
      row.connectionId,
      row.connectionVersion,
      db,
    );
    const latest = await this.records.latest(
      db,
      row.organizationId,
      row.guestId,
    );
    if (latest?.id !== row.id || latest.status !== "running")
      throw new DomainError(
        "PURCHASE_CHANGED",
        "This refresh is no longer current.",
        409,
      );
    return target;
  }

  async refresh(
    actor: TrustedActor,
    rawEventId: unknown,
    rawGuestId: unknown,
    input: unknown,
  ) {
    const eventId = z.uuid().parse(rawEventId),
      guestId = z.uuid().parse(rawGuestId);
    const value = purchaseRefreshSchema.parse(input);
    const pending = await this.db.transaction(async (tx) => {
      const current = await this.identity(actor);
      const { organizationId, event } = await this.events.lockEvent(
        current,
        eventId,
        tx,
      );
      this.events.requireCapability(event, "events.responses.manage");
      const target = await this.target(tx, organizationId, eventId, guestId);
      const existing = await this.records.request(
        tx,
        organizationId,
        value.requestId,
      );
      if (existing) {
        if (existing.guestId !== guestId || existing.eventId !== eventId)
          throw new DomainError(
            "PURCHASE_REPLAY_CONFLICT",
            "This request belongs to another booking.",
            409,
          );
        return { replay: true as const };
      }
      const connection = await this.available(tx, target);
      const latest = await this.records.latest(tx, organizationId, guestId);
      if (
        (latest?.version ?? 0) !== value.expectedVersion ||
        (latest?.status === "running" &&
          Date.now() - latest.startedAt.getTime() < 30_000)
      )
        throw new DomainError(
          "PURCHASE_CONFLICT",
          "Purchase details changed or a refresh is running. Reload before continuing.",
          409,
        );
      if (latest?.status === "running") await this.records.fail(tx, latest.id);
      if (this.client.mode === "blocked") throw this.unavailable();
      const row = await this.records.start(tx, {
        organizationId,
        eventId,
        guestId,
        sourceId: target.source.id,
        requestId: value.requestId,
        version: value.expectedVersion + 1,
        status: "running",
        mode: this.client.mode,
        recipientEmail: target.guest.email.trim().toLowerCase(),
        sourceVersion: target.source.version,
        apiVersion: target.api.version,
        connectionId: connection.id,
        connectionVersion: connection.version,
        guestObservedAt: target.guest.observedAt,
      });
      return {
        replay: false as const,
        row,
        target,
        connection,
        eventVersion: event.version,
      };
    });
    if (pending.replay) return this.workspace(actor, eventId, guestId);
    try {
      const signal = AbortSignal.timeout(25_000);
      const guard = () =>
        this.guard(actor, pending.row, pending.eventVersion, this.db);
      await guard();
      await new RequestLimiter(this.db).consume(
        "luma-api",
        pending.row.organizationId,
        120,
      );
      const event = await this.client.event(
        pending.connection.apiKey,
        pending.target.api.providerEventId,
        signal,
      );
      this.access.match(event, {
        eventId: pending.target.api.providerEventId,
        calendarId: pending.connection.calendarId,
        url: pending.target.source.url,
      });
      await guard();
      await new RequestLimiter(this.db).consume(
        "luma-api",
        pending.row.organizationId,
        120,
      );
      const details = await this.client.guestDetails(
        pending.connection.apiKey,
        pending.target.api.providerEventId,
        pending.target.guest.providerGuestId,
        signal,
      );
      if (
        details.providerGuestId !== pending.target.guest.providerGuestId ||
        details.email !== pending.row.recipientEmail
      )
        throw new DomainError(
          "PURCHASE_IDENTITY_CHANGED",
          "Provider details do not match this booking.",
          409,
        );
      await this.db.transaction(async (tx) => {
        await this.events.lockEvent(await this.identity(actor), eventId, tx);
        await this.guard(actor, pending.row, pending.eventVersion, tx);
        await this.records.complete(tx, pending.row, details);
        await this.audit.record(tx, {
          organizationId: pending.row.organizationId,
          actorUserId: actor.userId,
          action: "integration.luma.purchase_observed",
          targetId: pending.row.id,
        });
      });
    } catch (error) {
      // Provider bodies and private identifiers never become messages or logs.
      const mismatch =
        error instanceof DomainError &&
        ["PURCHASE_IDENTITY_CHANGED", "PURCHASE_OWNERSHIP_CHANGED"].includes(
          error.code,
        );
      await this.records.fail(
        this.db,
        pending.row.id,
        mismatch ? "identity_changed" : "refresh_failed",
      );
    }
    return this.workspace(await this.identity(actor), eventId, guestId);
  }
}

type PurchaseTarget = {
  guest: typeof lumaGuestProjection.$inferSelect;
  source: typeof eventPackageSource.$inferSelect;
  api: typeof lumaApiEvent.$inferSelect;
};
