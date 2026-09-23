import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { clubEvent, eventManager } from "../../db/schema/events";
import { guestAccess } from "../../db/schema/guest-access";
import { lumaGuestProjection } from "../../db/schema/luma-sync";
import {
  lumaPurchaseIdentity,
  lumaPurchaseOrder,
  lumaPurchaseRefresh,
} from "../../db/schema/luma-purchases";
import { registrationSettings } from "../../db/schema/registrations";
import { EventPackageService } from "../../src/features/events/EventPackageService";
import { eventFields } from "../../src/features/events/event_schemas";
import { GuestAccessService } from "../../src/features/guests/GuestAccessService";
import { GuestPurchaseService } from "../../src/features/guests/GuestPurchaseService";
import { LumaGuestAccessSource } from "../../src/integrations/luma/LumaGuestAccessSource";
import { type Context, confirm, fixture, setup } from "./luma-sync-fixture";

export function detail(id: string, email: string, refunded = 0) {
  return {
    id,
    user_id: `usr-${id}`,
    user_email: email,
    event_ticket_orders: [
      {
        id: `order-${id}`,
        amount: 2500,
        amount_discount: 200,
        amount_tax: 100,
        currency: "eur",
        is_captured: true,
        amount_refunded: refunded,
        coupon_info: null,
      },
    ],
    event_tickets: [
      {
        id: `ticket-${id}`,
        name: "Synthetic admission",
        amount: 2500,
        amount_discount: 200,
        amount_tax: 100,
        currency: "eur",
        is_captured: true,
        checked_in_at: null,
        event_ticket_type_id: "type-one",
      },
    ],
    check_in_qr_code: "synthetic-private-qr-excluded",
    registration_answers: [{ value: "synthetic-private-answer-excluded" }],
    receipt_url: "https://untrusted.example.test/receipt?token=excluded",
  };
}

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function purchaseFixture(context: Context) {
  const provider = await fixture();
  try {
    const s = await setup(context, provider.client);
    await s.db
      .update(clubEvent)
      .set({
        published: eventFields(await s.events.detail(s.manager, s.event.id)),
      })
      .where(eq(clubEvent.id, s.event.id));
    await s.link();
    await s.reconcile();
    const first = await context.actor("purchase-first");
    const second = await context.actor("purchase-second");
    const records = await s.db.select().from(lumaGuestProjection);
    const firstGuest = records.find(
      (row) => row.providerGuestId === "gst-one",
    )!;
    const secondGuest = records.find(
      (row) => row.providerGuestId === "gst-two",
    )!;
    for (const [person, row] of [
      [first, firstGuest],
      [second, secondGuest],
    ] as const) {
      await s.db
        .update(lumaGuestProjection)
        .set({ email: person.email })
        .where(eq(lumaGuestProjection.id, row.id));
      provider.detail(
        detail(row.providerGuestId, person.email),
        "evt-sync",
        row.providerGuestId,
      );
    }
    await s.modules.change(s.manager, {
      id: s.event.id,
      ...confirm((await s.events.detail(s.manager, s.event.id)).version),
      key: "portal",
      operation: "enable",
      suspendDependents: false,
    });
    const guests = new GuestAccessService(
      s.db,
      s.events,
      s.modules,
      s.registrations,
      new LumaGuestAccessSource(),
    );
    const purchases = new GuestPurchaseService(
      s.db,
      s.events,
      s.modules,
      guests,
      s.access,
      s.connectionAccess,
      provider.client,
      s.resolveActor,
    );
    const packages = new EventPackageService(
      s.db,
      context.authorization,
      s.events,
      s.modules,
      s.registrations,
      s.links,
    );
    const claim = async (person = first, row = firstGuest) => {
      const grant = await guests.grant(s.manager, s.event.id, {
        source: "luma",
        sourceId: row.id,
        confirmed: true,
      });
      await guests.claim(person, s.event.id, grant.id, { confirmed: true });
      return grant.id;
    };
    const refresh = async (
      guestId = firstGuest.id,
      requestId = randomUUID(),
    ) => {
      const current = await purchases.workspace(s.manager, s.event.id, guestId);
      return purchases.refresh(s.manager, s.event.id, guestId, {
        ...confirm(current.version),
        requestId,
      });
    };
    const sourceEnabled = async (enabled: boolean) => {
      const source = (
        await packages.workspace(s.manager, s.event.id)
      ).sources.find((row) => row.id === firstGuest.sourceId)!;
      await packages.source(s.manager, s.event.id, {
        id: source.id,
        label: source.label,
        enabled,
        ...confirm(source.version),
      });
    };
    const changePortal = async (operation: "enable" | "disable") => {
      await s.modules.change(s.manager, {
        id: s.event.id,
        ...confirm((await s.events.detail(s.manager, s.event.id)).version),
        key: "portal",
        operation,
        suspendDependents: false,
      });
    };
    return {
      ...s,
      provider,
      first,
      second,
      firstGuest,
      secondGuest,
      guests,
      purchases,
      claim,
      refresh,
      sourceEnabled,
      changePortal,
    };
  } catch (error) {
    await provider.close();
    throw error;
  }
}

export function purchaseChecks(get: () => Context) {
  const ready = () => purchaseFixture(get());

  it("C10 purchases: requires a claimed grant and current staff scope; isolates event and guest ownership", async () => {
    const s = await ready();
    try {
      expect(
        await s.purchases.workspace(s.manager, s.event.id, s.firstGuest.id),
      ).toMatchObject({ status: "never", version: 0, orders: [], tickets: [] });
      await s.refresh();
      await expect(
        s.purchases.mine(s.first, s.event.id, s.firstGuest.id),
      ).rejects.toThrow();
      expect(await s.guests.mine(s.first)).toEqual([]);
      const firstGrant = await s.claim();
      const secondGrant = await s.claim(s.second, s.secondGuest);
      const own = await s.purchases.mine(s.first, s.event.id, firstGrant);
      expect(own).toMatchObject({ status: "observed", refreshAllowed: false });
      expect(own.orders).toHaveLength(1);
      expect(
        await s.purchases.mine(s.second, s.event.id, secondGrant),
      ).toMatchObject({ status: "never", orders: [] });
      await expect(
        s.purchases.mine(s.second, s.event.id, firstGrant),
      ).rejects.toThrow();
      await expect(
        s.purchases.mine(
          { ...s.second, email: s.first.email },
          s.event.id,
          firstGrant,
        ),
      ).rejects.toThrow();
      await expect(
        s.purchases.workspace(s.first, s.event.id, s.firstGuest.id),
      ).rejects.toThrow();
      await expect(
        s.purchases.refresh(s.first, s.event.id, s.firstGuest.id, {
          ...confirm(own.version),
          requestId: randomUUID(),
        }),
      ).rejects.toThrow();
      expect(
        await s.db
          .select()
          .from(membership)
          .where(eq(membership.userId, s.first.userId)),
      ).toEqual([]);

      const editor = await get().actor("purchase-editor");
      await s.db.insert(membership).values({
        organizationId: s.scope.organizationId,
        userId: editor.userId,
        status: "approved",
        role: "member",
      });
      await s.db.insert(eventManager).values({
        organizationId: s.scope.organizationId,
        eventId: s.event.id,
        userId: editor.userId,
        role: "editor",
      });
      await expect(
        s.purchases.workspace(editor, s.event.id, s.firstGuest.id),
      ).rejects.toThrow();
      const other = await s.events.create(s.owner, {
        ...s.fields,
        managerUserId: s.owner.userId,
      });
      await expect(
        s.purchases.workspace(s.manager, other.id, s.firstGuest.id),
      ).rejects.toThrow();
      await expect(
        s.purchases.mine(s.first, other.id, firstGrant),
      ).rejects.toThrow();
      const [order] = await s.db.select().from(lumaPurchaseOrder);
      await expect(
        s.db.insert(lumaPurchaseOrder).values({
          ...order,
          id: randomUUID(),
          eventId: other.id,
          providerOrderId: "order-cross-event",
        }),
      ).rejects.toThrow();
    } finally {
      await s.provider.close();
    }
  });

  it("C10 purchases: applies authoritative details atomically, fences identity and order owners, and replays without a provider request", async () => {
    const s = await ready();
    try {
      const requestId = randomUUID();
      const first = await s.refresh(s.firstGuest.id, requestId);
      const grant = await s.claim();
      expect(first.orders[0]).toMatchObject({
        reference: "order-gst-one",
        amount: 2500,
        discount: 200,
        tax: 100,
        currency: "EUR",
        captured: true,
        refunded: 0,
        state: "captured",
      });
      const calls = s.provider.detailCalls();
      expect(
        await s.purchases.refresh(s.manager, s.event.id, s.firstGuest.id, {
          ...confirm(0),
          requestId,
        }),
      ).toEqual(first);
      await expect(
        s.purchases.refresh(s.manager, s.event.id, s.secondGuest.id, {
          ...confirm(0),
          requestId,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        s.purchases.refresh(s.manager, s.event.id, s.firstGuest.id, {
          ...confirm(0),
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(s.provider.detailCalls()).toBe(calls);

      s.provider.detail(detail("gst-one", s.first.email, 2501));
      expect(await s.refresh()).toMatchObject({
        status: "failed",
        receiptId: first.receiptId,
        orders: first.orders,
      });
      for (const invalid of [
        { ...detail("gst-one", s.first.email), id: "gst-other" },
        detail("gst-one", s.second.email),
        { ...detail("gst-one", s.first.email), user_id: "usr-reassigned" },
      ]) {
        s.provider.detail(invalid);
        const failed = await s.refresh();
        expect(failed).toMatchObject({
          status: "failed",
          receiptId: null,
          orders: [],
          tickets: [],
        });
      }
      // A later network failure cannot erase an unresolved identity mismatch.
      s.provider.failDetail(true);
      expect(await s.refresh()).toMatchObject({
        status: "failed",
        receiptId: null,
        orders: [],
        tickets: [],
      });
      expect(await s.purchases.mine(s.first, s.event.id, grant)).toMatchObject({
        status: "failed",
        receiptId: null,
        orders: [],
        tickets: [],
      });
      await expect(
        s.purchases.receipt(s.first, s.event.id, grant),
      ).rejects.toThrow();
      s.provider.failDetail(false);
      s.provider.detail(detail("gst-one", s.first.email, 500));
      const partial = await s.refresh();
      expect(partial).toMatchObject({
        status: "observed",
        orders: [
          expect.objectContaining({ refunded: 500, state: "partly_refunded" }),
        ],
      });
      expect(
        (await s.purchases.mine(s.first, s.event.id, grant)).orders,
      ).toEqual(partial.orders);
      s.provider.detail(detail("gst-one", s.first.email, 2500));
      const refunded = await s.refresh();
      expect(refunded.orders[0]).toMatchObject({
        refunded: 2500,
        state: "refunded",
      });
      s.provider.failDetail(true);
      const failed = await s.refresh();
      expect(failed).toMatchObject({
        status: "failed",
        receiptId: refunded.receiptId,
        orders: refunded.orders,
      });
      const replayCalls = s.provider.detailCalls();
      expect(
        await s.purchases.refresh(s.manager, s.event.id, s.firstGuest.id, {
          ...confirm(0),
          requestId,
        }),
      ).toEqual(failed);
      expect(s.provider.detailCalls()).toBe(replayCalls);

      s.provider.failDetail(false);
      const duplicate = detail("gst-two", s.second.email);
      duplicate.event_ticket_orders[0].id = "order-gst-one";
      s.provider.detail(duplicate, "evt-sync", "gst-two");
      expect(await s.refresh(s.secondGuest.id)).toMatchObject({
        status: "failed",
        orders: [],
        receiptId: null,
      });
      expect(await s.db.select().from(lumaPurchaseOrder)).toHaveLength(1);
      expect(await s.db.select().from(lumaPurchaseIdentity)).toHaveLength(1);
      const records = await s.db.select().from(lumaPurchaseRefresh);
      expect(records.filter((row) => row.status === "succeeded")).toHaveLength(
        3,
      );
      expect(
        records
          .filter((row) => row.status === "failed")
          .every((row) => row.snapshot === null),
      ).toBe(true);
      const succeeded = records.find((row) => row.status === "succeeded")!;
      await expect(
        s.db
          .update(lumaPurchaseRefresh)
          .set({ snapshot: {} })
          .where(eq(lumaPurchaseRefresh.id, succeeded.id)),
      ).rejects.toThrow();
      await expect(
        s.db
          .delete(lumaPurchaseRefresh)
          .where(eq(lumaPurchaseRefresh.id, succeeded.id)),
      ).rejects.toThrow();
    } finally {
      await s.provider.close();
    }
  });

  it("C10 purchases: marks changed observations stale and rejects source and session changes during authoritative refresh", async () => {
    const s = await ready();
    try {
      const grant = await s.claim();
      const first = await s.refresh();
      await s.db
        .update(lumaGuestProjection)
        .set({ observedAt: new Date(s.firstGuest.observedAt.getTime() + 1) })
        .where(eq(lumaGuestProjection.id, s.firstGuest.id));
      expect(await s.purchases.mine(s.first, s.event.id, grant)).toMatchObject({
        status: "stale",
        receiptId: first.receiptId,
      });
      await s.refresh();
      await s.sourceEnabled(false);
      await expect(
        s.purchases.mine(s.first, s.event.id, grant),
      ).rejects.toThrow();
      await s.sourceEnabled(true);
      expect(await s.purchases.mine(s.first, s.event.id, grant)).toMatchObject({
        status: "stale",
      });
      const arrived = latch();
      const released = latch();
      s.provider.holdDetail((response) => {
        arrived.resolve();
        void released.promise.then(() =>
          response.end(JSON.stringify(detail("gst-one", s.first.email))),
        );
      });
      const pending = s.refresh();
      await arrived.promise;
      try {
        await s.sourceEnabled(false);
        await s.sourceEnabled(true);
      } finally {
        released.resolve();
      }
      expect(await pending).toMatchObject({ status: "failed" });
      s.provider.holdDetail();
      const recovered = await s.refresh();
      expect(recovered.status).toBe("observed");

      const nextArrived = latch();
      const nextReleased = latch();
      s.provider.holdDetail((response) => {
        nextArrived.resolve();
        void nextReleased.promise.then(() =>
          response.end(JSON.stringify(detail("gst-one", s.first.email, 1000))),
        );
      });
      const revoked = s.refresh();
      await nextArrived.promise;
      s.revokeSession();
      nextReleased.resolve();
      await expect(revoked).rejects.toMatchObject({ status: 401 });
      const rejected = await s.purchases.workspace(
        s.manager,
        s.event.id,
        s.firstGuest.id,
      );
      expect(rejected).toMatchObject({
        status: "failed",
        receiptId: recovered.receiptId,
        orders: recovered.orders,
      });
      expect(
        (await s.db.select().from(lumaPurchaseRefresh)).filter(
          (row) => row.status === "succeeded",
        ),
      ).toHaveLength(3);
    } finally {
      await s.provider.close();
    }
  });

  it("C10 purchases: keeps receipts private and narrow, refreshes refunds after booking closure, and rechecks grant and portal lifecycle", async () => {
    const s = await ready();
    try {
      const grant = await s.claim();
      const payload = detail("gst-one", s.first.email);
      payload.event_ticket_orders.push(
        {
          ...payload.event_ticket_orders[0],
          id: "order-free",
          amount: 0,
          amount_discount: 0,
          amount_tax: 0,
          is_captured: false,
        },
        {
          ...payload.event_ticket_orders[0],
          id: "order-pending",
          is_captured: false,
        },
      );
      s.provider.detail(payload);
      const observed = await s.refresh();
      expect(observed.orders.map((order) => order.state)).toEqual([
        "captured",
        "free",
        "uncaptured",
      ]);
      const receipt = await s.purchases.receipt(s.first, s.event.id, grant);
      expect(receipt).toContain("order-gst-one");
      expect(receipt).toContain("EUR");
      const serialized = `${JSON.stringify(observed)}\n${receipt}`;
      for (const excluded of [
        s.first.email,
        s.second.email,
        "usr-gst-one",
        "synthetic-private",
        "untrusted.example.test",
        "check_in_qr_code",
        "registration_answers",
      ]) {
        expect(serialized).not.toContain(excluded);
      }
      expect(
        observed.receiptUrl === null ||
          new URL(observed.receiptUrl).hostname === "luma.com",
      ).toBe(true);
      expect(Object.keys(observed.orders[0]).sort()).toEqual([
        "amount",
        "captured",
        "currency",
        "discount",
        "reference",
        "refunded",
        "state",
        "tax",
      ]);
      await expect(
        s.purchases.receipt(s.second, s.event.id, grant),
      ).rejects.toThrow();

      await s.db
        .update(registrationSettings)
        .set({ open: false })
        .where(
          and(
            eq(registrationSettings.eventId, s.event.id),
            eq(registrationSettings.organizationId, s.scope.organizationId),
          ),
        );
      s.provider.detail(detail("gst-one", s.first.email, 2500));
      const refunded = await s.refresh();
      expect(refunded).toMatchObject({
        status: "observed",
        orders: [expect.objectContaining({ state: "refunded" })],
      });
      expect(
        (await s.purchases.mine(s.first, s.event.id, grant)).orders,
      ).toEqual(refunded.orders);
      await s.changePortal("disable");
      await expect(
        s.purchases.mine(s.first, s.event.id, grant),
      ).rejects.toThrow();
      await expect(
        s.purchases.receipt(s.first, s.event.id, grant),
      ).rejects.toThrow();
      await s.changePortal("enable");
      expect(
        (await s.purchases.mine(s.first, s.event.id, grant)).orders,
      ).toEqual(refunded.orders);
      await s.db
        .update(lumaGuestProjection)
        .set({ email: s.second.email })
        .where(eq(lumaGuestProjection.id, s.firstGuest.id));
      await expect(
        s.purchases.receipt(s.first, s.event.id, grant),
      ).rejects.toThrow();
      await s.db
        .update(lumaGuestProjection)
        .set({ email: s.first.email })
        .where(eq(lumaGuestProjection.id, s.firstGuest.id));
      const [current] = await s.db
        .select()
        .from(guestAccess)
        .where(eq(guestAccess.id, grant));
      await s.guests.revoke(
        s.manager,
        s.event.id,
        grant,
        confirm(current.version),
      );
      await expect(
        s.purchases.mine(s.first, s.event.id, grant),
      ).rejects.toThrow();
      await expect(
        s.purchases.receipt(s.first, s.event.id, grant),
      ).rejects.toThrow();
    } finally {
      await s.provider.close();
    }
  });
}
