import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  eventDraw,
  eventDrawResult,
  eventDrawReview,
} from "../../../db/schema/event-draws";
import { user } from "../../../db/schema/auth";
import {
  DomainError,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";
import {
  drawAwardsSchema,
  drawSnapshotSchema,
  publicWinnersSchema,
  type DrawRecord,
} from "./draw_schemas";
import { drawDigest } from "./draw_selection";
import { EventPrizeReader } from "./EventPrizeReader";

/** Internal reader. Services must establish current event scope before calling. */
export class EventDrawReader {
  async records(
    organizationId: string,
    eventId: string,
    tx: DatabaseExecutor,
  ): Promise<DrawRecord[]> {
    const rows = await tx
      .select({ draw: eventDraw, actor: user.name })
      .from(eventDraw)
      .innerJoin(user, eq(user.id, eventDraw.createdBy))
      .where(
        and(
          eq(eventDraw.organizationId, organizationId),
          eq(eventDraw.eventId, eventId),
        ),
      )
      .orderBy(desc(eventDraw.createdAt), asc(eventDraw.id));
    const results = await tx
      .select({ result: eventDrawResult, actor: user.name })
      .from(eventDrawResult)
      .innerJoin(user, eq(user.id, eventDrawResult.createdBy))
      .where(
        and(
          eq(eventDrawResult.organizationId, organizationId),
          eq(eventDrawResult.eventId, eventId),
        ),
      );
    const reviews = await tx
      .select({ review: eventDrawReview, actor: user.name })
      .from(eventDrawReview)
      .innerJoin(user, eq(user.id, eventDrawReview.createdBy))
      .where(
        and(
          eq(eventDrawReview.organizationId, organizationId),
          eq(eventDrawReview.eventId, eventId),
        ),
      )
      .orderBy(desc(eventDrawReview.version));
    return rows.map(({ draw, actor }) => {
      const snapshot = drawSnapshotSchema.parse(draw.snapshot);
      const outcome = results.find(({ result }) => result.drawId === draw.id);
      const history = reviews.filter(({ review }) => review.drawId === draw.id);
      const latest = history[0]?.review;
      const awards = outcome
        ? drawAwardsSchema.parse(outcome.result.awards)
        : null;
      if (
        drawDigest(snapshot) !== draw.digest ||
        (outcome &&
          drawDigest({ snapshotDigest: draw.digest, awards }) !==
            outcome.result.digest)
      )
        throw new DomainError(
          "DRAW_INTEGRITY",
          "This draw's saved evidence could not be verified. No operation was performed.",
          409,
        );
      return {
        id: draw.id,
        snapshot,
        digest: draw.digest,
        createdAt: draw.createdAt.toISOString(),
        createdBy: actor || "Club staff",
        version: latest?.version ?? 0,
        issue: null,
        state:
          latest?.operation === "cancel"
            ? "cancelled"
            : outcome
              ? "drawn"
              : "frozen",
        result:
          outcome && awards
            ? {
                awards,
                digest: outcome.result.digest,
                createdAt: outcome.result.createdAt.toISOString(),
                createdBy: outcome.actor || "Club staff",
              }
            : null,
        published:
          latest?.operation === "publish"
            ? publicWinnersSchema.parse(latest.publicWinners)
            : [],
        history: history.map(({ review, actor: name }) => ({
          version: review.version,
          operation: review.operation,
          reason: review.reason,
          createdAt: review.createdAt.toISOString(),
          createdBy: name || "Club staff",
        })),
      };
    });
  }

  /** Only the explicit public names/title projection is selected; no private snapshot query. */
  async published(
    organizationId: string,
    eventId: string,
    tx: DatabaseExecutor,
  ) {
    const rows = await tx
      .select({
        drawId: eventDrawReview.drawId,
        operation: eventDrawReview.operation,
        winners: eventDrawReview.publicWinners,
      })
      .from(eventDrawReview)
      .innerJoin(
        eventDrawResult,
        and(
          eq(eventDrawResult.drawId, eventDrawReview.drawId),
          eq(eventDrawResult.eventId, eventDrawReview.eventId),
          eq(eventDrawResult.organizationId, eventDrawReview.organizationId),
        ),
      )
      .where(
        and(
          eq(eventDrawReview.organizationId, organizationId),
          eq(eventDrawReview.eventId, eventId),
        ),
      )
      .orderBy(desc(eventDrawReview.version), asc(eventDrawReview.drawId));
    const prizes = await new EventPrizeReader().published(
      organizationId,
      eventId,
      tx,
    );
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (seen.has(row.drawId)) return [];
      seen.add(row.drawId);
      if (row.operation !== "publish") return [];
      return publicWinnersSchema
        .parse(row.winners)
        .filter((winner) =>
          prizes.some(
            (prize) =>
              prize.id === winner.prizeId &&
              prize.revisionId === winner.revisionId,
          ),
        )
        .map(({ prizeTitle, displayName }) => ({ prizeTitle, displayName }));
    });
  }
}
