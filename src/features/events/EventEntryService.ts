import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import { user } from "../../../db/schema/auth";
import { z } from "zod";
import { eventEntry, eventEntryReview } from "../../../db/schema/event-entries";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { EventService } from "./EventService";
import type { EventModuleService } from "./EventModuleService";
import type { GuestPurchaseService } from "../guests/GuestPurchaseService";
import {
  createEntrySchema,
  reviewEntrySchema,
  type EntryBookingOrders,
  type EntryEvidence,
  type EntryPurchaseEvidence,
  type EntryRecord,
  type EntryWorkspace,
} from "./entry_schemas";

type Entry = typeof eventEntry.$inferSelect;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Demonstration allocations only. A purchase amount never determines an entry count. */
export class EventEntryService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly purchases: GuestPurchaseService,
  ) {}

  private async scope(actor: TrustedActor, eventId: string, tx: Transaction) {
    const scope = await this.events.lockEvent(
      actor,
      z.uuid().parse(eventId),
      tx,
    );
    this.events.requireCapability(scope.event, "events.entries.manage");
    const modules = await this.modules.readiness(
      scope.organizationId,
      eventId,
      tx,
    );
    const unavailableReason = scope.event.archived
      ? "This event is archived. Its entry history is retained."
      : scope.event.cancelled
        ? "This event is cancelled. Its entry history is retained."
        : !modules.find((module) => module.key === "prizes")?.available
          ? "Enable Prizes in Event features to manage entries."
          : null;
    return { ...scope, unavailableReason };
  }

  private requireWritable(reason: string | null) {
    if (reason) throw new DomainError("ENTRIES_UNAVAILABLE", reason, 409);
  }

  private evidence(
    purchase: EntryPurchaseEvidence | null,
    reference: string,
  ): EntryEvidence {
    if (!purchase)
      return {
        key: hash("manual-demo"),
        receiptId: null,
        order: null,
        issue: null,
      };
    const order =
      purchase.orders.find((row) => row.reference === reference) ?? null;
    const issue =
      purchase.mode !== "fixture"
        ? "Real purchases cannot be used in demonstration entries."
        : !purchase.approved
          ? "This booking is no longer approved or present."
          : purchase.status !== "observed"
            ? "Refresh this booking’s purchase details before approving entries."
            : !order
              ? "This payment reference is missing from the latest purchase details."
              : order.refunded > 0
                ? "A refund was recorded. Keep these entries on hold or void them."
                : order.amount > 0 && !order.captured
                  ? "This payment has not been captured."
                  : null;
    return {
      key: hash({
        guestId: purchase.guestId,
        receiptId: purchase.receiptId,
        version: purchase.version,
        mode: purchase.mode,
        status: purchase.status,
        approved: purchase.approved,
        order,
      }),
      receiptId: purchase.receiptId,
      order,
      issue,
    };
  }

  private async purchase(
    actor: TrustedActor,
    entry: Entry,
    tx: DatabaseExecutor,
  ) {
    if (!entry.guestId) return null;
    return this.purchases.entryEvidence(
      actor,
      entry.organizationId,
      entry.eventId,
      entry.guestId,
      tx,
    );
  }

  private async project(
    entry: Entry,
    purchase: EntryPurchaseEvidence | null,
    tx: DatabaseExecutor,
  ): Promise<EntryRecord> {
    const history = await tx
      .select({ ...getTableColumns(eventEntryReview), actorName: user.name })
      .from(eventEntryReview)
      .innerJoin(user, eq(user.id, eventEntryReview.createdBy))
      .where(
        and(
          eq(eventEntryReview.entryId, entry.id),
          eq(eventEntryReview.organizationId, entry.organizationId),
          eq(eventEntryReview.eventId, entry.eventId),
        ),
      )
      .orderBy(desc(eventEntryReview.version));
    const latest = history[0];
    if (!latest)
      throw new DomainError(
        "ENTRY_HISTORY_MISSING",
        "This entry has no saved decision and cannot be used.",
        409,
      );
    const evidence = this.evidence(purchase, entry.reference);
    const holdReason =
      evidence.issue ??
      (evidence.key !== latest.evidenceKey
        ? "Purchase details changed. Review the latest details before using these entries."
        : latest.decision === "hold"
          ? latest.reason
          : null);
    return {
      id: entry.id,
      label: entry.label,
      reference: entry.reference,
      source: entry.guestId ? "purchase" : "manual",
      guestId: entry.guestId,
      state:
        latest.decision === "void" ? "void" : holdReason ? "held" : "ready",
      holdReason,
      quantity: latest.quantity,
      version: latest.version,
      evidence,
      history: history.map(
        ({ version, quantity, decision, reason, createdAt, actorName }) => ({
          actorName,
          version,
          quantity,
          decision,
          reason,
          createdAt: createdAt.toISOString(),
        }),
      ),
    };
  }

  async workspace(
    actor: TrustedActor,
    eventId: string,
    transaction?: Transaction,
  ): Promise<EntryWorkspace> {
    const read = async (tx: Transaction): Promise<EntryWorkspace> => {
      const scope = await this.scope(actor, eventId, tx);
      const rows = await tx
        .select()
        .from(eventEntry)
        .where(
          and(
            eq(eventEntry.eventId, eventId),
            eq(eventEntry.organizationId, scope.organizationId),
          ),
        )
        .orderBy(asc(eventEntry.createdAt), asc(eventEntry.id));
      const purchases = new Map<string, EntryPurchaseEvidence | null>();
      const entries: EntryRecord[] = [];
      for (const row of rows) {
        if (row.guestId && !purchases.has(row.guestId))
          purchases.set(row.guestId, await this.purchase(actor, row, tx));
        entries.push(
          await this.project(
            row,
            row.guestId ? purchases.get(row.guestId)! : null,
            tx,
          ),
        );
      }
      return {
        mode: "demo",
        canManage: !scope.unavailableReason,
        unavailableReason: scope.unavailableReason,
        entries,
      };
    };
    return transaction ? read(transaction) : this.db.transaction(read);
  }

  async bookings(actor: TrustedActor, eventId: string) {
    return this.db.transaction(async (tx) => {
      await this.scope(actor, eventId, tx);
      return this.purchases.entryBookings(actor, eventId, tx);
    });
  }

  async bookingOrders(
    actor: TrustedActor,
    eventId: string,
    guestId: string,
  ): Promise<EntryBookingOrders> {
    return this.db.transaction(async (tx) => {
      const scope = await this.scope(actor, eventId, tx);
      const purchase = await this.purchases.entryEvidence(
        actor,
        scope.organizationId,
        eventId,
        guestId,
        tx,
      );
      return {
        label: purchase.label,
        orders: purchase.orders.map((order) => ({
          reference: order.reference,
          evidence: this.evidence(purchase, order.reference),
        })),
      };
    });
  }

  private async replay(
    tx: Transaction,
    org: string,
    eventId: string,
    requestId: string,
    requestHash: string,
  ) {
    const [existing] = await tx
      .select()
      .from(eventEntryReview)
      .where(
        and(
          eq(eventEntryReview.organizationId, org),
          eq(eventEntryReview.requestId, requestId),
        ),
      );
    if (
      existing &&
      (existing.eventId !== eventId || existing.requestHash !== requestHash)
    )
      throw new DomainError(
        "ENTRY_REQUEST_CONFLICT",
        "This request was already used for a different decision. Reload before trying again.",
        409,
      );
    return existing;
  }

  private checkEvidence(
    evidence: EntryEvidence,
    expected: string,
    approving: boolean,
  ) {
    if (evidence.key !== expected)
      throw new DomainError(
        "ENTRY_EVIDENCE_CHANGED",
        "Purchase details changed while you were reviewing. Reload the entries and review again.",
        409,
      );
    if (approving && evidence.issue)
      throw new DomainError("ENTRY_EVIDENCE_HELD", evidence.issue, 409);
  }

  async create(actor: TrustedActor, eventId: string, raw: unknown) {
    const input = createEntrySchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope(actor, eventId, tx);
      this.requireWritable(scope.unavailableReason);
      const requestHash = hash({
        operation: "create",
        eventId,
        actor: actor.userId,
        input,
      });
      const replay = await this.replay(
        tx,
        scope.organizationId,
        eventId,
        input.requestId,
        requestHash,
      );
      if (replay) return { id: replay.entryId };
      const rows = await tx
        .select({ id: eventEntry.id })
        .from(eventEntry)
        .where(
          and(
            eq(eventEntry.eventId, eventId),
            eq(eventEntry.organizationId, scope.organizationId),
          ),
        );
      if (rows.length >= 200)
        throw new DomainError(
          "ENTRY_LIMIT",
          "This demonstration supports up to 200 participants per event.",
          409,
        );
      const guestId = input.source === "purchase" ? input.guestId : null;
      const [duplicate] = await tx
        .select({ id: eventEntry.id })
        .from(eventEntry)
        .where(
          and(
            eq(eventEntry.eventId, eventId),
            eq(eventEntry.organizationId, scope.organizationId),
            eq(eventEntry.reference, input.reference),
            guestId
              ? eq(eventEntry.guestId, guestId)
              : isNull(eventEntry.guestId),
          ),
        );
      if (duplicate)
        throw new DomainError(
          "ENTRY_REFERENCE_EXISTS",
          "Entries already exist for this reference. Review the existing record to change its quantity.",
          409,
        );
      const purchase = guestId
        ? await this.purchases.entryEvidence(
            actor,
            scope.organizationId,
            eventId,
            guestId,
            tx,
          )
        : null;
      const evidence = this.evidence(purchase, input.reference);
      if (input.source === "purchase")
        this.checkEvidence(evidence, input.expectedEvidenceKey, true);
      const [entry] = await tx
        .insert(eventEntry)
        .values({
          eventId,
          organizationId: scope.organizationId,
          mode: "demo",
          guestId,
          label: input.source === "manual" ? input.label : purchase!.label,
          reference: input.reference,
          createdBy: actor.userId,
        })
        .returning();
      await tx.insert(eventEntryReview).values({
        entryId: entry.id,
        eventId,
        organizationId: scope.organizationId,
        guestId,
        version: 1,
        quantity: input.quantity,
        decision: "approve",
        reason: input.reason,
        receiptId: evidence.receiptId,
        evidenceKey: evidence.key,
        requestId: input.requestId,
        requestHash,
        createdBy: actor.userId,
      });
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "event.entry.demo.allocated",
        targetId: entry.id,
      });
      return { id: entry.id };
    });
  }

  async review(
    actor: TrustedActor,
    eventId: string,
    rawId: string,
    raw: unknown,
  ) {
    const id = z.uuid().parse(rawId);
    const input = reviewEntrySchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope(actor, eventId, tx);
      this.requireWritable(scope.unavailableReason);
      const [entry] = await tx
        .select()
        .from(eventEntry)
        .where(
          and(
            eq(eventEntry.id, id),
            eq(eventEntry.eventId, eventId),
            eq(eventEntry.organizationId, scope.organizationId),
          ),
        );
      if (!entry)
        throw new DomainError(
          "ENTRY_NOT_FOUND",
          "This entry is not available in this event.",
          404,
        );
      const requestHash = hash({
        operation: "review",
        eventId,
        id,
        actor: actor.userId,
        input,
      });
      if (
        await this.replay(
          tx,
          scope.organizationId,
          eventId,
          input.requestId,
          requestHash,
        )
      )
        return { id };
      const current = await this.project(
        entry,
        await this.purchase(actor, entry, tx),
        tx,
      );
      if (current.version !== input.expectedVersion)
        throw new DomainError(
          "ENTRY_VERSION_CHANGED",
          "Another decision was saved. Your entered changes are preserved; reload and review again.",
          409,
        );
      if (current.state === "void")
        throw new DomainError(
          "ENTRY_VOID",
          "Voided entries stay in the history and cannot be used again.",
          409,
        );
      this.checkEvidence(
        current.evidence,
        input.expectedEvidenceKey,
        input.decision === "approve",
      );
      await tx.insert(eventEntryReview).values({
        entryId: id,
        eventId,
        organizationId: scope.organizationId,
        guestId: entry.guestId,
        version: current.version + 1,
        quantity: input.quantity,
        decision: input.decision,
        reason: input.reason,
        receiptId: current.evidence.receiptId,
        evidenceKey: current.evidence.key,
        requestId: input.requestId,
        requestHash,
        createdBy: actor.userId,
      });
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: `event.entry.demo.${input.decision}`,
        targetId: id,
      });
      return { id };
    });
  }
}
