import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  eventDraw,
  eventDrawResult,
  eventDrawReview,
  eventDrawSlot,
} from "../../../db/schema/event-draws";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { EventService } from "./EventService";
import type { EventModuleService } from "./EventModuleService";
import type { EventEntryService } from "./EventEntryService";
import { EventPrizeReader } from "./EventPrizeReader";
import { EventDrawReader } from "./EventDrawReader";
import { EventPublicAccess } from "./EventPublicAccess";
import { drawDigest, selectDrawAwards } from "./draw_selection";
import {
  drawSnapshotSchema,
  freezeDrawSchema,
  reviewDrawSchema,
  runDrawSchema,
  type DrawCandidate,
  type DrawPreparation,
  type DrawRecord,
  type DrawWorkspace,
} from "./draw_schemas";

/** Local demonstration only. No financial eligibility or live provider calls. */
export class EventDrawService {
  private readonly reader = new EventDrawReader();
  private readonly prizes = new EventPrizeReader();
  private readonly audit = new AuditRepository();
  private readonly access: EventPublicAccess;
  constructor(
    private readonly db: Database,
    private readonly events: EventService,
    modules: EventModuleService,
    private readonly entries: EventEntryService,
  ) {
    this.access = new EventPublicAccess(db, events, modules);
  }

  private async scope(actor: TrustedActor, eventId: string, tx: Transaction) {
    const scope = await this.events.lockEvent(
      actor,
      z.uuid().parse(eventId),
      tx,
    );
    this.events.requireCapability(scope.event, "events.entries.manage");
    return scope;
  }
  private writable(reason: string | null) {
    if (reason) throw new DomainError("DRAW_UNAVAILABLE", reason, 409);
  }
  private async preparation(
    actor: TrustedActor,
    org: string,
    eventId: string,
    tx: Transaction,
  ) {
    const entries = await this.entries.workspace(actor, eventId, tx);
    const prizes = await this.prizes.published(org, eventId, tx);
    const reservations = await tx
      .select()
      .from(eventDrawSlot)
      .where(
        and(
          eq(eventDrawSlot.eventId, eventId),
          eq(eventDrawSlot.organizationId, org),
        ),
      );
    const candidates: DrawCandidate[] = entries.entries
      .filter((entry) => entry.state === "ready")
      .map((entry) => ({
        entryId: entry.id,
        participantKey: entry.guestId
          ? `booking:${entry.guestId}`
          : `manual:${entry.id}`,
        label: entry.label,
        version: entry.version,
        quantity: entry.quantity,
        evidenceKey: entry.evidence.key,
      }));
    const availablePrizes = prizes.map((prize) => {
      const reserved = new Set(
        reservations
          .filter((slot) => slot.prizeId === prize.id)
          .map((slot) => slot.unit),
      );
      const availableUnits: number[] = [];
      for (
        let unit = 1;
        unit <= prize.quantity && availableUnits.length < 20;
        unit += 1
      ) {
        if (!reserved.has(unit)) availableUnits.push(unit);
      }
      return {
        id: prize.id,
        revisionId: prize.revisionId,
        title: prize.title,
        availableUnits,
      };
    });
    const preparation: DrawPreparation = {
      key: drawDigest({
        entries: entries.entries.map((entry) => ({
          id: entry.id,
          state: entry.state,
          version: entry.version,
          evidence: entry.evidence.key,
        })),
        prizes: availablePrizes,
      }),
      candidates,
      excludedRecords: entries.entries.length - candidates.length,
      prizes: availablePrizes,
    };
    return {
      preparation,
      unavailableReason: entries.unavailableReason,
      prizes,
    };
  }
  private issue(
    draw: DrawRecord,
    candidates: DrawCandidate[],
    prizes: { id: string; revisionId: string }[],
  ) {
    if (draw.state === "cancelled") return null;
    if (
      draw.snapshot.candidates.some(
        (frozen) =>
          !candidates.some(
            (current) =>
              current.entryId === frozen.entryId &&
              current.version === frozen.version &&
              current.evidenceKey === frozen.evidenceKey &&
              current.quantity === frozen.quantity,
          ),
      )
    )
      return "Reviewed entries changed after freezing. Void this draw and prepare a new one from the current register.";
    if (
      draw.snapshot.slots.some(
        (slot) =>
          !prizes.some(
            (prize) =>
              prize.id === slot.prizeId && prize.revisionId === slot.revisionId,
          ),
      )
    )
      return "A selected prize changed or was unpublished. Void this draw and prepare a new one after reviewing the gallery.";
    return null;
  }
  async workspace(
    actor: TrustedActor,
    eventId: string,
  ): Promise<DrawWorkspace> {
    return this.db.transaction(async (tx) => {
      const scope = await this.scope(actor, eventId, tx);
      const { preparation, unavailableReason, prizes } = await this.preparation(
        actor,
        scope.organizationId,
        eventId,
        tx,
      );
      const items = await this.reader.records(
        scope.organizationId,
        eventId,
        tx,
      );
      return {
        canManage: !unavailableReason,
        canPublish: scope.event.capabilities.includes("events.publish"),
        unavailableReason,
        preparation,
        items: items.map((item) => ({
          ...item,
          issue: this.issue(item, preparation.candidates, prizes),
        })),
      };
    });
  }

  async freeze(actor: TrustedActor, eventId: string, raw: unknown) {
    const input = freezeDrawSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope(actor, eventId, tx);
      const hash = drawDigest({ actor: actor.userId, eventId, input });
      const [existing] = await tx
        .select()
        .from(eventDraw)
        .where(
          and(
            eq(eventDraw.organizationId, scope.organizationId),
            eq(eventDraw.requestId, input.requestId),
          ),
        );
      if (existing) {
        if (existing.requestHash !== hash || existing.eventId !== eventId)
          throw new DomainError(
            "DRAW_REQUEST_CONFLICT",
            "This request was already used for another draw. Reload and review again.",
            409,
          );
        return { id: existing.id };
      }
      const { preparation, unavailableReason } = await this.preparation(
        actor,
        scope.organizationId,
        eventId,
        tx,
      );
      this.writable(unavailableReason);
      if (preparation.key !== input.expectedPreparationKey)
        throw new DomainError(
          "DRAW_PREPARATION_CHANGED",
          "Entries or prizes changed during review. Close this dialog, refresh, and review again.",
          409,
        );
      const draws = await tx
        .select({ id: eventDraw.id })
        .from(eventDraw)
        .where(
          and(
            eq(eventDraw.organizationId, scope.organizationId),
            eq(eventDraw.eventId, eventId),
          ),
        );
      if (draws.length >= 50)
        throw new DomainError(
          "DRAW_LIMIT",
          "This demonstration supports up to 50 saved draws per event.",
          409,
        );
      if (
        new Set(input.prizes.map((prize) => prize.prizeId)).size !==
        input.prizes.length
      )
        throw new DomainError(
          "DRAW_DUPLICATE_PRIZE",
          "Choose each prize only once.",
          422,
        );
      const slots = input.prizes.flatMap((selection) => {
        const prize = preparation.prizes.find(
          (item) => item.id === selection.prizeId,
        );
        if (!prize || prize.availableUnits.length < selection.quantity)
          throw new DomainError(
            "DRAW_PRIZE_UNAVAILABLE",
            "A selected prize is unpublished or already reserved by another draw.",
            409,
          );
        return prize.availableUnits
          .slice(0, selection.quantity)
          .map((unit) => ({
            prizeId: prize.id,
            revisionId: prize.revisionId,
            title: prize.title,
            unit,
          }));
      });
      const capacity = input.rules.repeatWinners
        ? preparation.candidates.reduce((sum, entry) => sum + entry.quantity, 0)
        : new Set(preparation.candidates.map((entry) => entry.participantKey))
            .size;
      if (capacity < slots.length)
        throw new DomainError(
          "DRAW_INSUFFICIENT_ENTRIES",
          "There are not enough reviewed participants or entries for these prizes and rules.",
          422,
        );
      const snapshot = drawSnapshotSchema.parse({
        version: 1,
        mode: "demo",
        title: input.title,
        rules: input.rules,
        candidates: preparation.candidates,
        slots,
      });
      const [draw] = await tx
        .insert(eventDraw)
        .values({
          organizationId: scope.organizationId,
          eventId,
          snapshot,
          digest: drawDigest(snapshot),
          requestId: input.requestId,
          requestHash: hash,
          createdBy: actor.userId,
        })
        .returning({ id: eventDraw.id });
      await tx.insert(eventDrawSlot).values(
        slots.map((slot) => ({
          organizationId: scope.organizationId,
          eventId,
          drawId: draw.id,
          prizeId: slot.prizeId,
          unit: slot.unit,
        })),
      );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "event.draw.demo.frozen",
        targetId: draw.id,
      });
      return { id: draw.id };
    });
  }

  private async record(
    org: string,
    eventId: string,
    id: string,
    tx: Transaction,
  ) {
    z.uuid().parse(id);
    const draw = (await this.reader.records(org, eventId, tx)).find(
      (row) => row.id === id,
    );
    if (!draw)
      throw new DomainError(
        "DRAW_NOT_FOUND",
        "This draw is not available in this event.",
        404,
      );
    return draw;
  }
  async run(actor: TrustedActor, eventId: string, id: string, raw: unknown) {
    const input = runDrawSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope(actor, eventId, tx);
      const draw = await this.record(scope.organizationId, eventId, id, tx);
      if (draw.digest !== input.expectedDigest)
        throw new DomainError(
          "DRAW_CHANGED",
          "The reviewed draw does not match. Reload before continuing.",
          409,
        );
      if (draw.state === "cancelled")
        throw new DomainError(
          "DRAW_CANCELLED",
          "This draw was voided. Its history is retained.",
          409,
        );
      if (draw.result) return { id, result: draw.result };
      const { preparation, unavailableReason, prizes } = await this.preparation(
        actor,
        scope.organizationId,
        eventId,
        tx,
      );
      this.writable(unavailableReason);
      this.writable(this.issue(draw, preparation.candidates, prizes));
      const reservations = await tx
        .select()
        .from(eventDrawSlot)
        .where(
          and(
            eq(eventDrawSlot.drawId, id),
            eq(eventDrawSlot.eventId, eventId),
            eq(eventDrawSlot.organizationId, scope.organizationId),
          ),
        );
      if (
        reservations.length !== draw.snapshot.slots.length ||
        draw.snapshot.slots.some(
          (slot) =>
            !reservations.some(
              (row) => row.prizeId === slot.prizeId && row.unit === slot.unit,
            ),
        )
      )
        throw new DomainError(
          "DRAW_RESERVATIONS_CHANGED",
          "The prize reservations do not match this draw. No selection was made.",
          409,
        );
      const awards = selectDrawAwards(draw.snapshot);
      await tx.insert(eventDrawResult).values({
        drawId: id,
        organizationId: scope.organizationId,
        eventId,
        awards,
        digest: drawDigest({ snapshotDigest: draw.digest, awards }),
        createdBy: actor.userId,
      });
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "event.draw.demo.executed",
        targetId: id,
      });
      return {
        id,
        result: (await this.record(scope.organizationId, eventId, id, tx))
          .result,
      };
    });
  }

  async review(actor: TrustedActor, eventId: string, id: string, raw: unknown) {
    const input = reviewDrawSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope(actor, eventId, tx);
      if (input.operation !== "cancel")
        this.events.requireCapability(scope.event, "events.publish");
      const draw = await this.record(scope.organizationId, eventId, id, tx);
      const hash = drawDigest({ actor: actor.userId, eventId, id, input });
      const [replay] = await tx
        .select()
        .from(eventDrawReview)
        .where(
          and(
            eq(eventDrawReview.organizationId, scope.organizationId),
            eq(eventDrawReview.requestId, input.requestId),
          ),
        );
      if (replay) {
        if (replay.requestHash !== hash || replay.drawId !== id)
          throw new DomainError(
            "DRAW_REQUEST_CONFLICT",
            "This request was already used for another decision.",
            409,
          );
        return { id };
      }
      if (draw.version !== input.expectedVersion)
        throw new DomainError(
          "DRAW_VERSION_CHANGED",
          "Another decision was saved. Close this dialog, refresh, and review again.",
          409,
        );
      if (draw.state === "cancelled")
        throw new DomainError(
          "DRAW_CANCELLED",
          "This draw is voided and cannot be changed.",
          409,
        );
      const published: DrawRecord["published"] = [];
      if (input.operation === "publish") {
        const { preparation, unavailableReason, prizes } =
          await this.preparation(actor, scope.organizationId, eventId, tx);
        this.writable(unavailableReason);
        this.writable(this.issue(draw, preparation.candidates, prizes));
        if (!draw.result || !input.winners.length)
          throw new DomainError(
            "DRAW_PUBLIC_NAMES_REQUIRED",
            "Run the demonstration and enter at least one approved public name.",
            422,
          );
        const seen = new Set<string>();
        for (const winner of input.winners) {
          const key = `${winner.prizeId}:${winner.unit}`;
          const award = draw.result.awards.find(
            (item) =>
              item.prizeId === winner.prizeId && item.unit === winner.unit,
          );
          const slot = draw.snapshot.slots.find(
            (item) =>
              item.prizeId === winner.prizeId && item.unit === winner.unit,
          );
          if (!award || !slot || seen.has(key))
            throw new DomainError(
              "DRAW_WINNER_INVALID",
              "Choose each recorded winner only once.",
              422,
            );
          seen.add(key);
          published.push({
            prizeId: slot.prizeId,
            revisionId: slot.revisionId,
            prizeTitle: slot.title,
            unit: slot.unit,
            displayName: winner.displayName,
          });
        }
      } else if (input.winners.length) {
        throw new DomainError(
          "DRAW_WINNER_INVALID",
          "Names are only accepted when publishing winners.",
          422,
        );
      }
      // Withdrawal/cancellation remains possible after disabling a feature or archiving an event.
      await tx.insert(eventDrawReview).values({
        drawId: id,
        organizationId: scope.organizationId,
        eventId,
        version: draw.version + 1,
        operation: input.operation,
        reason: input.reason,
        publicWinners: published,
        requestId: input.requestId,
        requestHash: hash,
        createdBy: actor.userId,
      });
      if (input.operation === "cancel")
        await tx
          .delete(eventDrawSlot)
          .where(
            and(
              eq(eventDrawSlot.drawId, id),
              eq(eventDrawSlot.eventId, eventId),
              eq(eventDrawSlot.organizationId, scope.organizationId),
            ),
          );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: `event.draw.demo.${input.operation}`,
        targetId: id,
      });
      return { id };
    });
  }

  async published(actor: TrustedActor | null, eventId: string) {
    z.uuid().parse(eventId);
    try {
      return await this.db.transaction(
        async (tx) => {
          const scope = await this.access.require(actor, eventId, "prizes", tx);
          if (scope.cancelled) return [];
          return this.reader.published(scope.organizationId, eventId, tx);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    } catch (error) {
      if (error instanceof DomainError && error.status === 404) return [];
      throw error;
    }
  }
}
