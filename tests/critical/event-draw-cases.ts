import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { clubEvent, eventManager } from "../../db/schema/events";
import {
  eventDraw,
  eventDrawResult,
  eventDrawReview,
  eventDrawSlot,
} from "../../db/schema/event-draws";
import { EventEntryService } from "../../src/features/events/EventEntryService";
import { EventDrawService } from "../../src/features/events/EventDrawService";
import { EventPrizeService } from "../../src/features/events/EventPrizeService";
import { MediaService } from "../../src/features/media/MediaService";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { selectDrawAwards } from "../../src/features/events/draw_selection";
import {
  freezeDrawSchema,
  type DrawRecord,
  type DrawSnapshot,
} from "../../src/features/events/draw_schemas";
import { eventFields } from "../../src/features/events/event_schemas";
import { detail, purchaseFixture } from "./purchase-cases";
import { type Context, confirm } from "./luma-sync-fixture";

const rules = {
  version: 1,
  purpose: "Synthetic fairness and publication rehearsal",
  selection: "weighted_entries_without_replacement",
  repeatWinners: false,
};
const decision = (draw: DrawRecord, operation: string) => ({
  mode: "demo",
  requestId: randomUUID(),
  expectedVersion: draw.version,
  operation,
  reason: "Reviewed this synthetic demonstration decision",
  confirmed: true,
});
export function eventDrawChecks(get: () => Context) {
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
      const draws = new EventDrawService(s.db, s.events, s.modules, entries);
      const prizes = new EventPrizeService(
        s.db,
        get().authorization,
        s.events,
        s.modules,
        new MediaService(
          s.db,
          get().authorization,
          new LocalStorageDriver(resolve(".local/test-uploads")),
        ),
      );
      const saved = await prizes.save(s.manager, s.event.id, {
        expectedVersion: 0,
        draft: {
          title: "Synthetic draw prize",
          description: "Practice item",
          imageId: null,
          alt: "",
          quantity: 2,
          position: 0,
          partnerId: null,
        },
      });
      const prize = saved.items[0]!;
      await prizes.publication(s.manager, s.event.id, prize.id, {
        ...confirm(prize.version),
        operation: "publish",
      });
      for (const [label, quantity] of [
        ["Private synthetic Alpha", 2],
        ["Private synthetic Beta", 3],
      ] as const) {
        await entries.create(s.manager, s.event.id, {
          mode: "demo",
          source: "manual",
          requestId: randomUUID(),
          label,
          reference: `private-${label}`,
          quantity,
          reason: "Invented entries for the draw regression",
        });
      }
      const workspace = () => draws.workspace(s.manager, s.event.id);
      const prepare = async (quantity = 2) => ({
        mode: "demo",
        requestId: randomUUID(),
        expectedPreparationKey: (await workspace()).preparation.key,
        title: "Synthetic frozen draw",
        rules,
        prizes: [{ prizeId: prize.id, quantity }],
        confirmed: true,
      });
      const current = async (id: string) =>
        (await workspace()).items.find((item) => item.id === id)!;
      const freeze = async () =>
        current(
          (await draws.freeze(s.manager, s.event.id, await prepare())).id,
        );
      const run = (draw: DrawRecord) =>
        draws.run(s.manager, s.event.id, draw.id, {
          mode: "demo",
          expectedDigest: draw.digest,
          confirmed: true,
        });
      return {
        ...s,
        entries,
        draws,
        prizes,
        prize,
        workspace,
        prepare,
        current,
        freeze,
        run,
      };
    } catch (error) {
      await s.provider.close();
      throw error;
    }
  }

  it("C11 draws: weights every ticket correctly, removes used tickets and respects shared participant limits", () => {
    const snapshot: DrawSnapshot = {
      version: 1,
      mode: "demo",
      title: "Synthetic",
      rules: {
        ...rules,
        version: 1,
        selection: "weighted_entries_without_replacement",
        repeatWinners: true,
      },
      candidates: [
        {
          entryId: randomUUID(),
          participantKey: "shared-booking",
          label: "A",
          version: 1,
          quantity: 2,
          evidenceKey: "a".repeat(64),
        },
        {
          entryId: randomUUID(),
          participantKey: "shared-booking",
          label: "B",
          version: 1,
          quantity: 1,
          evidenceKey: "b".repeat(64),
        },
        {
          entryId: randomUUID(),
          participantKey: "another-booking",
          label: "C",
          version: 1,
          quantity: 2,
          evidenceKey: "c".repeat(64),
        },
      ],
      slots: [
        {
          prizeId: randomUUID(),
          revisionId: randomUUID(),
          title: "Prize",
          unit: 1,
        },
      ],
    };
    const first = Array.from(
      { length: 5 },
      (_, rank) => selectDrawAwards(snapshot, () => rank)[0],
    );
    expect(
      first.map((award) => [
        snapshot.candidates.findIndex(
          (entry) => entry.entryId === award.entryId,
        ),
        award.ticket,
      ]),
    ).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
    const all = {
      ...snapshot,
      slots: Array.from({ length: 5 }, (_, index) => ({
        ...snapshot.slots[0],
        unit: index + 1,
      })),
    };
    const selected = selectDrawAwards(all, () => 0);
    expect(
      new Set(selected.map((award) => `${award.entryId}:${award.ticket}`)).size,
    ).toBe(5);
    const oneEach = selectDrawAwards(
      {
        ...all,
        rules: { ...snapshot.rules, repeatWinners: false },
        slots: all.slots.slice(0, 2),
      },
      () => 0,
    );
    expect(
      oneEach.map(
        (award) =>
          snapshot.candidates.find((entry) => entry.entryId === award.entryId)!
            .participantKey,
      ),
    ).toEqual(["shared-booking", "another-booking"]);
  });

  it("C11 draws: freezes once, reserves prizes and replays one immutable result under concurrent requests", async () => {
    const s = await ready();
    try {
      const input = await s.prepare();
      const [one, two] = await Promise.all([
        s.draws.freeze(s.manager, s.event.id, input),
        s.draws.freeze(s.manager, s.event.id, input),
      ]);
      expect(one).toEqual(two);
      await expect(
        s.draws.freeze(s.manager, s.event.id, { ...input, title: "Different" }),
      ).rejects.toMatchObject({ code: "DRAW_REQUEST_CONFLICT" });
      await expect(
        s.draws.freeze(s.manager, s.event.id, await s.prepare()),
      ).rejects.toMatchObject({ code: "DRAW_PRIZE_UNAVAILABLE" });
      expect((await s.workspace()).items).toHaveLength(1);
      const frozen = await s.current(one.id);
      const results = await Promise.all([s.run(frozen), s.run(frozen)]);
      expect(results[0]).toEqual(results[1]);
      expect(
        new Set(results[0].result!.awards.map((award) => award.entryId)).size,
      ).toBe(2);
      const restarted = new EventDrawService(
        s.db,
        s.events,
        s.modules,
        s.entries,
      );
      expect(
        await restarted.run(s.manager, s.event.id, one.id, {
          mode: "demo",
          expectedDigest: frozen.digest,
          confirmed: true,
        }),
      ).toEqual(results[0]);
      expect(await s.db.select().from(eventDrawResult)).toHaveLength(1);
      await expect(
        s.db
          .update(eventDraw)
          .set({ digest: "b".repeat(64) })
          .where(eq(eventDraw.id, one.id)),
      ).rejects.toThrow();
      await expect(
        s.db.delete(eventDrawResult).where(eq(eventDrawResult.drawId, one.id)),
      ).rejects.toThrow();
      await expect(
        s.db.delete(eventDrawSlot).where(eq(eventDrawSlot.drawId, one.id)),
      ).rejects.toThrow();
      expect(
        (
          await s.db.execute<{ allowed: boolean }>(
            sql`select has_table_privilege(current_user, 'club.event_draw_result', 'TRUNCATE') as allowed`,
          )
        ).rows[0].allowed,
      ).toBe(false);
      expect(
        freezeDrawSchema.safeParse({ ...input, mode: "live" }).success,
      ).toBe(false);
    } finally {
      await s.provider.close();
    }
  });

  it("C11 draws: stale review, changed eligibility and disabled features cannot select winners", async () => {
    const s = await ready();
    try {
      const stale = await s.prepare();
      const entry = (await s.entries.workspace(s.manager, s.event.id))
        .entries[0];
      const review = (version: number, decision: string) => ({
        mode: "demo",
        requestId: randomUUID(),
        expectedVersion: version,
        expectedEvidenceKey: entry.evidence.key,
        quantity: entry.quantity,
        decision,
        reason: "Recheck synthetic participant eligibility",
      });
      await s.entries.review(
        s.manager,
        s.event.id,
        entry.id,
        review(entry.version, "hold"),
      );
      await expect(
        s.draws.freeze(s.manager, s.event.id, stale),
      ).rejects.toMatchObject({ code: "DRAW_PREPARATION_CHANGED" });
      expect((await s.workspace()).preparation.candidates).toHaveLength(1);
      await s.entries.review(
        s.manager,
        s.event.id,
        entry.id,
        review(entry.version + 1, "approve"),
      );
      const frozen = await s.freeze();
      await s.entries.review(
        s.manager,
        s.event.id,
        entry.id,
        review(entry.version + 2, "hold"),
      );
      await expect(s.run(frozen)).rejects.toMatchObject({
        code: "DRAW_UNAVAILABLE",
      });
      expect(await s.db.select().from(eventDrawResult)).toHaveLength(0);
      const cancel = decision(frozen, "cancel");
      await s.draws.review(s.manager, s.event.id, frozen.id, cancel);
      await s.draws.review(s.manager, s.event.id, frozen.id, cancel);
      expect((await s.current(frozen.id)).history).toHaveLength(1);
      expect(
        (await s.workspace()).preparation.prizes[0].availableUnits,
      ).toHaveLength(2);
      await expect(s.run(frozen)).rejects.toMatchObject({
        code: "DRAW_CANCELLED",
      });
      const next = await s.draws.freeze(
        s.manager,
        s.event.id,
        await s.prepare(1),
      );
      await s.modules.change(s.manager, {
        id: s.event.id,
        ...confirm((await s.events.detail(s.manager, s.event.id)).version),
        key: "prizes",
        operation: "disable",
        suspendDependents: false,
      });
      expect(await s.workspace()).toMatchObject({ canManage: false });
      await expect(s.run(await s.current(next.id))).rejects.toMatchObject({
        code: "DRAW_UNAVAILABLE",
      });
      await s.draws.review(
        s.manager,
        s.event.id,
        next.id,
        decision(await s.current(next.id), "cancel"),
      );
      expect((await s.current(next.id)).state).toBe("cancelled");
    } finally {
      await s.provider.close();
    }
  });

  it("C11 draws: private results require deliberate safe publication and retain history after withdrawal or rerun", async () => {
    const s = await ready();
    try {
      const frozen = await s.freeze();
      await s.run(frozen);
      expect(await s.draws.published(null, s.event.id)).toEqual([]);
      const draw = await s.current(frozen.id);
      const winner = draw.result!.awards[0];
      const input = {
        ...decision(draw, "publish"),
        winners: [
          {
            prizeId: winner.prizeId,
            unit: winner.unit,
            displayName: "Approved demo alias",
          },
        ],
      };
      await expect(
        s.draws.review(s.manager, s.event.id, draw.id, {
          ...input,
          winners: [{ ...input.winners[0], email: "private@example.test" }],
        }),
      ).rejects.toThrow();
      await expect(
        s.draws.review(s.manager, s.event.id, draw.id, {
          ...input,
          winners: [{ ...input.winners[0], unit: 999 }],
        }),
      ).rejects.toMatchObject({ code: "DRAW_WINNER_INVALID" });
      await s.draws.review(s.manager, s.event.id, draw.id, input);
      expect(await s.draws.published(null, s.event.id)).toEqual([]); // Event is still private.
      const fields = eventFields(await s.events.detail(s.owner, s.event.id));
      await s.db
        .update(clubEvent)
        .set({ published: { ...fields, visibility: "public" } })
        .where(eq(clubEvent.id, s.event.id));
      expect(await s.draws.published(null, s.event.id)).toEqual([
        {
          prizeTitle: "Synthetic draw prize",
          displayName: "Approved demo alias",
        },
      ]);
      await s.draws.review(
        s.manager,
        s.event.id,
        draw.id,
        decision(await s.current(draw.id), "unpublish"),
      );
      expect(await s.draws.published(null, s.event.id)).toEqual([]);
      await expect(
        s.draws.review(s.manager, s.event.id, draw.id, {
          ...input,
          requestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "DRAW_VERSION_CHANGED" });
      await s.draws.review(s.manager, s.event.id, draw.id, {
        ...input,
        ...decision(await s.current(draw.id), "publish"),
      });
      await s.prizes.publication(s.manager, s.event.id, s.prize.id, {
        ...confirm(s.prize.version + 1),
        operation: "unpublish",
      });
      expect(await s.draws.published(null, s.event.id)).toEqual([]);
      await s.draws.review(
        s.manager,
        s.event.id,
        draw.id,
        decision(await s.current(draw.id), "cancel"),
      );
      const retained = await s.current(draw.id);
      expect(retained.state).toBe("cancelled");
      expect(retained.result).toEqual(draw.result);
      expect(retained.history).toHaveLength(4);
      await expect(
        s.db.delete(eventDrawReview).where(eq(eventDrawReview.drawId, draw.id)),
      ).rejects.toThrow();
      expect(await s.db.select().from(eventDrawSlot)).toHaveLength(0);
    } finally {
      await s.provider.close();
    }
  });

  it("C11 draws: enforces current manager, event and membership scope and excludes refunded fixture purchases", async () => {
    const s = await ready();
    try {
      const frozen = await s.freeze();
      const editor = await get().actor("draw-editor");
      await s.db
        .insert(membership)
        .values({
          organizationId: s.scope.organizationId,
          userId: editor.userId,
          status: "approved",
          role: "member",
        });
      await s.db
        .insert(eventManager)
        .values({
          organizationId: s.scope.organizationId,
          eventId: s.event.id,
          userId: editor.userId,
          role: "editor",
        });
      await expect(s.draws.workspace(editor, s.event.id)).rejects.toMatchObject(
        { code: "EVENT_ACCESS_DENIED" },
      );
      await expect(
        s.draws.run(editor, s.event.id, frozen.id, {
          mode: "demo",
          expectedDigest: frozen.digest,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ code: "EVENT_ACCESS_DENIED" });
      await expect(s.draws.workspace(s.first, s.event.id)).rejects.toThrow();
      const other = await s.events.create(s.owner, {
        title: "Other draw event",
        description: "",
        startsAt: "2030-01-01T12:00:00Z",
        endsAt: null,
        timezone: "UTC",
        venue: "",
        visibility: "private",
        managerUserId: s.manager.userId,
      });
      await expect(
        s.draws.run(s.manager, other.id, frozen.id, {
          mode: "demo",
          expectedDigest: frozen.digest,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ code: "DRAW_NOT_FOUND" });
      await expect(
        s.db
          .insert(eventDrawSlot)
          .values({
            drawId: frozen.id,
            organizationId: s.scope.organizationId,
            eventId: other.id,
            prizeId: s.prize.id,
            unit: 3,
          }),
      ).rejects.toThrow();
      await s.refresh();
      const order = (
        await s.entries.bookingOrders(s.manager, s.event.id, s.firstGuest.id)
      ).orders[0];
      const purchase = await s.entries.create(s.manager, s.event.id, {
        mode: "demo",
        source: "purchase",
        guestId: s.firstGuest.id,
        reference: order.reference,
        expectedEvidenceKey: order.evidence.key,
        quantity: 7,
        requestId: randomUUID(),
        reason: "Reviewed local fixture purchase",
      });
      expect(
        (await s.workspace()).preparation.candidates.some(
          (entry) => entry.entryId === purchase.id,
        ),
      ).toBe(true);
      s.provider.detail(detail(s.firstGuest.providerGuestId, s.first.email, 1));
      await s.refresh();
      expect(
        (await s.workspace()).preparation.candidates.some(
          (entry) => entry.entryId === purchase.id,
        ),
      ).toBe(false);
      await s.db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, s.manager.userId));
      await expect(s.workspace()).rejects.toThrow();
      await expect(s.run(frozen)).rejects.toThrow();
    } finally {
      await s.provider.close();
    }
  });
}
