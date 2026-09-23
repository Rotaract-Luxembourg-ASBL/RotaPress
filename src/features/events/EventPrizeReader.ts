import "server-only";
import { and, eq } from "drizzle-orm";
import {
  eventPrize,
  eventPrizeRevision,
} from "../../../db/schema/event-prizes";
import type { DatabaseExecutor } from "../../core/authorization/AuthorizationService";
import { PartnerReader } from "../partners/PartnerReader";
import type { PartnerPlacement } from "../partners/partner_schemas";
import { prizeDraftSchema, type PublicPrize } from "./prize_schemas";

/** Published editorial projections only; the caller owns event visibility checks. */
export class EventPrizeReader {
  private async rows(
    organizationId: string,
    executor: DatabaseExecutor,
    eventId?: string,
  ) {
    return executor
      .select({
        id: eventPrize.id,
        eventId: eventPrize.eventId,
        revisionId: eventPrizeRevision.id,
        snapshot: eventPrizeRevision.snapshot,
      })
      .from(eventPrize)
      .innerJoin(
        eventPrizeRevision,
        and(
          eq(eventPrizeRevision.id, eventPrize.publishedRevisionId),
          eq(eventPrizeRevision.prizeId, eventPrize.id),
          eq(eventPrizeRevision.eventId, eventPrize.eventId),
          eq(eventPrizeRevision.organizationId, eventPrize.organizationId),
        ),
      )
      .where(
        and(
          eq(eventPrize.organizationId, organizationId),
          eventId ? eq(eventPrize.eventId, eventId) : undefined,
        ),
      );
  }

  async published(
    organizationId: string,
    eventId: string,
    executor: DatabaseExecutor,
  ): Promise<PublicPrize[]> {
    const rows = (await this.rows(organizationId, executor, eventId)).map(
      (row) => ({ ...row, draft: prizeDraftSchema.parse(row.snapshot) }),
    );
    const partners = await new PartnerReader().published(
      organizationId,
      executor,
      rows.flatMap(({ draft }) => (draft.partnerId ? [draft.partnerId] : [])),
    );
    const profiles = new Map(partners.map((partner) => [partner.id, partner]));
    return rows
      .map(({ id, revisionId, draft }) => ({
        id,
        revisionId,
        title: draft.title,
        description: draft.description,
        imageId: draft.imageId,
        alt: draft.alt,
        quantity: draft.quantity,
        position: draft.position,
        partner: draft.partnerId
          ? (profiles.get(draft.partnerId) ?? null)
          : null,
      }))
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }

  /** Retained publication still owns its sponsor when the event or module is unavailable. */
  async placements(
    organizationId: string,
    partnerId: string,
    executor: DatabaseExecutor,
  ): Promise<PartnerPlacement[]> {
    return (await this.rows(organizationId, executor)).flatMap((row) => {
      const snapshot = prizeDraftSchema.parse(row.snapshot);
      return snapshot.partnerId === partnerId
        ? [
            {
              id: row.id,
              title: `Prize: ${snapshot.title}`,
              locale: null,
              eventId: row.eventId,
            },
          ]
        : [];
    });
  }
}
