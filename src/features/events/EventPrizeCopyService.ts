import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { eventPrize } from "../../../db/schema/event-prizes";
import type { Transaction } from "../../core/authorization/AuthorizationService";
import type { MediaService } from "../media/MediaService";
import { PartnerReader } from "../partners/PartnerReader";
import { prizeDraftSchema, type PrizeDraft } from "./prize_schemas";

export type PrizeCopy = { id: string; version: number; draft: PrizeDraft };

/** Copies reviewed editorial drafts, never publications or operational prize records. */
export class EventPrizeCopyService {
  constructor(private readonly media: MediaService) {}

  async snapshot(
    organizationId: string,
    eventId: string,
    tx: Transaction,
  ): Promise<PrizeCopy[]> {
    const rows = await tx
      .select()
      .from(eventPrize)
      .where(
        and(
          eq(eventPrize.organizationId, organizationId),
          eq(eventPrize.eventId, eventId),
        ),
      )
      .orderBy(asc(eventPrize.id));
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      draft: prizeDraftSchema.parse(row.draft),
    }));
  }

  async createDrafts(
    organizationId: string,
    eventId: string,
    prizes: PrizeCopy[],
    tx: Transaction,
  ) {
    if (!prizes.length) return;
    const drafts = prizes.map((item) => prizeDraftSchema.parse(item.draft));
    await this.media.assertPublicAssets(
      organizationId,
      drafts.flatMap((draft) => (draft.imageId ? [draft.imageId] : [])),
      tx,
    );
    await new PartnerReader().assertReferences(
      organizationId,
      drafts.flatMap((draft) => (draft.partnerId ? [draft.partnerId] : [])),
      true,
      tx,
    );
    const copied = await tx
      .insert(eventPrize)
      .values(drafts.map((draft) => ({ organizationId, eventId, draft })))
      .returning({ id: eventPrize.id, draft: eventPrize.draft });
    for (const row of copied) {
      const draft = prizeDraftSchema.parse(row.draft);
      await this.media.replaceUsage(
        `prize:${row.id}:draft`,
        organizationId,
        draft.imageId ? [draft.imageId] : [],
        tx,
      );
    }
  }
}
