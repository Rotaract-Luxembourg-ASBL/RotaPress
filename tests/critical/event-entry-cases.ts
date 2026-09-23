import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { eventEntry, eventEntryReview } from "../../db/schema/event-entries";
import { membership } from "../../db/schema/club";
import { eventManager } from "../../db/schema/events";
import { EventEntryService } from "../../src/features/events/EventEntryService";
import type { EntryRecord } from "../../src/features/events/entry_schemas";
import { detail, purchaseFixture } from "./purchase-cases";
import { type Context, confirm } from "./luma-sync-fixture";

const manual = () => ({
  mode: "demo",
  source: "manual",
  requestId: randomUUID(),
  label: "Synthetic participant",
  reference: "practice-one",
  quantity: 3,
  reason: "Synthetic allocation for local review",
});
const review = (entry: EntryRecord, decision = "approve") => ({
  mode: "demo",
  requestId: randomUUID(),
  expectedVersion: entry.version,
  expectedEvidenceKey: entry.evidence.key,
  quantity: entry.quantity,
  reason: "Reviewed the current demonstration evidence",
  decision,
});

export function eventEntryChecks(get: () => Context) {
  async function ready() {
    const s = await purchaseFixture(get());
    try {
      await s.modules.change(s.manager, {
        id: s.event.id,
        ...confirm((await s.events.detail(s.manager, s.event.id)).version),
        key: "prizes",
        operation: "enable",
        suspendDependents: false,
      });
      const entries = new EventEntryService(
        s.db,
        s.events,
        s.modules,
        s.purchases,
      );
      const workspace = () => entries.workspace(s.manager, s.event.id);
      const entry = async () => (await workspace()).entries[0]!;
      const allocate = async () => {
        await s.refresh();
        const orders = await entries.bookingOrders(
          s.manager,
          s.event.id,
          s.firstGuest.id,
        );
        const order = orders.orders[0]!;
        const input = {
          mode: "demo",
          source: "purchase",
          guestId: s.firstGuest.id,
          reference: order.reference,
          expectedEvidenceKey: order.evidence.key,
          quantity: 7,
          reason: "Seven synthetic entries, explicitly allocated",
          requestId: randomUUID(),
        };
        await entries.create(s.manager, s.event.id, input);
        return input;
      };
      return { ...s, entries, workspace, entry, allocate };
    } catch (cause) {
      await s.provider.close();
      throw cause;
    }
  }

  it("C11 entries: serializes replay, prevents duplicate references and retains immutable decisions", async () => {
    const s = await ready();
    try {
      const input = manual();
      const results = await Promise.all([
        s.entries.create(s.manager, s.event.id, input),
        s.entries.create(s.manager, s.event.id, input),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect((await s.workspace()).entries).toHaveLength(1);
      await expect(
        s.entries.create(s.manager, s.event.id, { ...input, quantity: 4 }),
      ).rejects.toMatchObject({ code: "ENTRY_REQUEST_CONFLICT" });
      await expect(
        s.entries.create(s.manager, s.event.id, {
          ...input,
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "ENTRY_REFERENCE_EXISTS" });
      const current = await s.entry();
      const decision = review(current, "hold");
      await s.entries.review(s.manager, s.event.id, current.id, decision);
      await s.entries.review(s.manager, s.event.id, current.id, decision);
      expect(await s.entry()).toMatchObject({
        state: "held",
        quantity: 3,
        version: 2,
      });
      const beforeConcurrent = await s.entry();
      const updates = await Promise.allSettled([
        s.entries.review(s.manager, s.event.id, current.id, {
          ...review(beforeConcurrent),
          quantity: 5,
        }),
        s.entries.review(
          s.manager,
          s.event.id,
          current.id,
          review(beforeConcurrent, "hold"),
        ),
      ]);
      expect(
        updates.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        updates.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect((await s.entry()).history).toHaveLength(3);
      await expect(
        s.db
          .update(eventEntry)
          .set({ label: "Changed history" })
          .where(eq(eventEntry.id, current.id)),
      ).rejects.toThrow();
      await expect(
        s.db
          .delete(eventEntryReview)
          .where(eq(eventEntryReview.entryId, current.id)),
      ).rejects.toThrow();
      const privilege = await s.db.execute<{ allowed: boolean }>(
        sql`select has_table_privilege(current_user, 'club.event_entry_review', 'TRUNCATE') as allowed`,
      );
      expect(privilege.rows[0]?.allowed).toBe(false);
      await s.entries.review(
        s.manager,
        s.event.id,
        current.id,
        review(await s.entry(), "void"),
      );
      expect(await s.entry()).toMatchObject({ state: "void", version: 4 });
      await expect(
        s.entries.review(
          s.manager,
          s.event.id,
          current.id,
          review(await s.entry()),
        ),
      ).rejects.toMatchObject({ code: "ENTRY_VOID" });
      await expect(
        s.entries.create(s.manager, s.event.id, { ...manual(), mode: "live" }),
      ).rejects.toThrow();
    } finally {
      await s.provider.close();
    }
  });

  it("C11 entries: binds exact purchase evidence, holds changed details and requires deliberate reconciliation", async () => {
    const s = await ready();
    try {
      await s.allocate();
      const first = await s.entry();
      expect(first).toMatchObject({
        quantity: 7,
        state: "ready",
        evidence: { order: { amount: 2500 } },
      });
      const savedReceipt = first.evidence.receiptId;
      await s.refresh();
      const changed = await s.entry();
      expect(changed.state).toBe("held");
      expect(changed.evidence.receiptId).not.toBe(savedReceipt);
      await expect(
        s.entries.review(s.manager, s.event.id, first.id, review(first)),
      ).rejects.toMatchObject({ code: "ENTRY_EVIDENCE_CHANGED" });
      const reviewed = { ...review(changed), quantity: 4 };
      await s.entries.review(s.manager, s.event.id, changed.id, reviewed);
      expect(await s.entry()).toMatchObject({
        quantity: 4,
        state: "ready",
        version: 2,
      });
      expect((await s.entry()).history.map((row) => row.quantity)).toEqual([
        4, 7,
      ]);
      s.provider.detail(
        detail(s.firstGuest.providerGuestId, s.first.email, 1000),
      );
      await s.refresh();
      const refunded = await s.entry();
      expect(refunded).toMatchObject({
        state: "held",
        evidence: { order: { refunded: 1000 } },
      });
      await expect(
        s.entries.review(s.manager, s.event.id, refunded.id, review(refunded)),
      ).rejects.toMatchObject({ code: "ENTRY_EVIDENCE_HELD" });
      await s.entries.review(
        s.manager,
        s.event.id,
        refunded.id,
        review(refunded, "void"),
      );
      expect(await s.entry()).toMatchObject({ state: "void", quantity: 4 });
      expect(await s.db.select().from(eventEntryReview)).toHaveLength(3);
    } finally {
      await s.provider.close();
    }
  });

  it("C11 entries: failed refresh, changed identity and disabled sources fail closed without erasing decisions", async () => {
    const s = await ready();
    try {
      await s.allocate();
      s.provider.failDetail(true);
      await expect(s.refresh()).resolves.toMatchObject({ status: "failed" });
      expect((await s.entry()).state).toBe("held");
      await expect(
        s.entries.review(
          s.manager,
          s.event.id,
          (await s.entry()).id,
          review(await s.entry()),
        ),
      ).rejects.toMatchObject({ code: "ENTRY_EVIDENCE_HELD" });
      s.provider.failDetail(false);
      await s.refresh();
      await s.entries.review(
        s.manager,
        s.event.id,
        (await s.entry()).id,
        review(await s.entry()),
      );
      await s.sourceEnabled(false);
      expect((await s.entry()).state).toBe("held");
      await s.sourceEnabled(true);
      await s.refresh();
      const wrong = detail(s.firstGuest.providerGuestId, s.first.email);
      wrong.user_id = "different-synthetic-provider-person";
      s.provider.detail(wrong);
      await expect(s.refresh()).resolves.toMatchObject({
        status: "failed",
        orders: [],
      });
      expect(await s.entry()).toMatchObject({
        state: "held",
        evidence: { order: null },
      });
      expect((await s.entry()).history).toHaveLength(2);
    } finally {
      await s.provider.close();
    }
  });

  it("C11 entries: enforces manager scope, event isolation and retained read-only lifecycle", async () => {
    const s = await ready();
    try {
      const { id } = await s.entries.create(s.manager, s.event.id, manual());
      for (const role of ["editor", "registration-manager"] as const) {
        const person = await get().actor(`entry-${role}`);
        await s.db.insert(membership).values({
          userId: person.userId,
          organizationId: s.scope.organizationId,
          status: "approved",
          role: "member",
        });
        await s.db.insert(eventManager).values({
          userId: person.userId,
          organizationId: s.scope.organizationId,
          eventId: s.event.id,
          role,
        });
        await expect(
          s.entries.workspace(person, s.event.id),
        ).rejects.toMatchObject({ code: "EVENT_ACCESS_DENIED" });
        await expect(
          s.entries.create(person, s.event.id, manual()),
        ).rejects.toMatchObject({ code: "EVENT_ACCESS_DENIED" });
      }
      await expect(
        s.entries.bookingOrders(s.first, s.event.id, s.firstGuest.id),
      ).rejects.toThrow();
      const other = await s.events.create(s.owner, {
        title: "Other synthetic event",
        description: "",
        startsAt: "2030-12-01T17:00:00Z",
        endsAt: null,
        timezone: "UTC",
        venue: "",
        visibility: "private",
        managerUserId: s.manager.userId,
      });
      for (const key of ["website", "prizes"] as const)
        await s.modules.change(s.manager, {
          id: other.id,
          ...confirm((await s.events.detail(s.manager, other.id)).version),
          key,
          operation: "enable",
          suspendDependents: false,
        });
      await expect(
        s.entries.review(s.manager, other.id, id, review(await s.entry())),
      ).rejects.toMatchObject({ code: "ENTRY_NOT_FOUND" });
      await expect(
        s.entries.bookingOrders(s.manager, other.id, s.firstGuest.id),
      ).rejects.toMatchObject({ code: "PURCHASE_UNAVAILABLE" });
      await s.modules.change(s.manager, {
        id: s.event.id,
        ...confirm((await s.events.detail(s.manager, s.event.id)).version),
        key: "prizes",
        operation: "disable",
        suspendDependents: false,
      });
      expect(await s.workspace()).toMatchObject({
        canManage: false,
        entries: [{ id }],
      });
      await expect(
        s.entries.review(s.manager, s.event.id, id, review(await s.entry())),
      ).rejects.toMatchObject({ code: "ENTRIES_UNAVAILABLE" });
      await s.db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, s.manager.userId));
      await expect(s.workspace()).rejects.toThrow();
    } finally {
      await s.provider.close();
    }
  });
}
