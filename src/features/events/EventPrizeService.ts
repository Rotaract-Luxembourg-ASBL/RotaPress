import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  eventPrize,
  eventPrizeRevision,
} from "../../../db/schema/event-prizes";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { MediaService } from "../media";
import { PartnerReader } from "../partners/PartnerReader";
import { EventModuleService } from "./EventModuleService";
import { EventService } from "./EventService";
import { EventPublicAccess } from "./EventPublicAccess";
import { EventPrizeReader } from "./EventPrizeReader";
import {
  prizeDraftSchema,
  prizeSaveSchema,
  prizePublicationSchema,
  type PrizeDraft,
  type PrizeWorkspace,
  type PublicPrize,
} from "./prize_schemas";

/** Managed editorial prizes, independent of purchases, entries and draw operations. */
export class EventPrizeService {
  private readonly audit = new AuditRepository();
  private readonly reader = new EventPrizeReader();
  private readonly partners = new PartnerReader();
  private readonly access: EventPublicAccess;

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly media: MediaService,
  ) {
    this.access = new EventPublicAccess(db, events, modules);
  }

  private rows(organizationId: string, eventId: string, tx: DatabaseExecutor) {
    return tx
      .select()
      .from(eventPrize)
      .where(
        and(
          eq(eventPrize.organizationId, organizationId),
          eq(eventPrize.eventId, eventId),
        ),
      )
      .orderBy(asc(eventPrize.id));
  }

  private changed() {
    return new DomainError(
      "PRIZE_CHANGED",
      "This prize changed. Reload and review the latest version before continuing.",
      409,
    );
  }

  async workspace(
    actor: TrustedActor,
    eventId: string,
    tx: DatabaseExecutor = this.db,
  ): Promise<PrizeWorkspace> {
    z.uuid().parse(eventId);
    const event = await this.events.detail(actor, eventId, tx);
    this.events.requireCapability(event, "events.edit");
    const { organizationId } = await this.authorization.approved(actor, tx);
    const modules = await this.modules.readiness(organizationId, eventId, tx);
    const canEdit =
      !event.archived &&
      !event.cancelled &&
      modules.some((module) => module.key === "prizes" && module.available);
    const published = await this.reader.published(organizationId, eventId, tx);
    return {
      canEdit,
      canPublish: canEdit && event.capabilities.includes("events.publish"),
      canUnpublish: event.capabilities.includes("events.publish"),
      items: (await this.rows(organizationId, eventId, tx))
        .map((row) => ({
          id: row.id,
          version: row.version,
          draft: prizeDraftSchema.parse(row.draft),
          published: published.find((item) => item.id === row.id) ?? null,
        }))
        .sort(
          (a, b) =>
            a.draft.position - b.draft.position || a.id.localeCompare(b.id),
        ),
    };
  }

  private async references(
    organizationId: string,
    draft: PrizeDraft,
    tx: Transaction,
  ) {
    // Event editors may select public club assets and published donor profiles only.
    await this.media.assertPublicAssets(
      organizationId,
      draft.imageId ? [draft.imageId] : [],
      tx,
    );
    await this.partners.assertReferences(
      organizationId,
      draft.partnerId ? [draft.partnerId] : [],
      true,
      tx,
    );
  }

  async save(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    const values = prizeSaveSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      this.events.requireCapability(event, "events.edit");
      this.events.requireActive(event);
      if (event.archived)
        throw new DomainError(
          "EVENT_ARCHIVED",
          "Archived events are read-only.",
          409,
        );
      await this.modules.requireEnabled(organizationId, eventId, "prizes", tx);
      const rows = await this.rows(organizationId, eventId, tx);
      const current = rows.find((row) => row.id === values.id);
      if (
        values.id
          ? !current || current.version !== values.expectedVersion
          : values.expectedVersion !== 0
      )
        throw this.changed();
      await this.references(organizationId, values.draft, tx);
      let id: string;
      if (current) {
        await tx
          .update(eventPrize)
          .set({
            draft: values.draft,
            version: current.version + 1,
          })
          .where(eq(eventPrize.id, current.id));
        id = current.id;
      } else {
        if (rows.length >= 200)
          throw new DomainError(
            "PRIZE_LIMIT",
            "This event already has 200 prizes.",
            409,
          );
        const [created] = await tx
          .insert(eventPrize)
          .values({
            organizationId,
            eventId,
            draft: values.draft,
          })
          .returning({ id: eventPrize.id });
        id = created.id;
      }
      await this.media.replaceUsage(
        `prize:${id}:draft`,
        organizationId,
        values.draft.imageId ? [values.draft.imageId] : [],
        tx,
      );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.prize.draft_saved",
        targetId: id,
      });
      return { ...(await this.workspace(actor, eventId, tx)), savedId: id };
    });
  }

  async publication(
    actor: TrustedActor,
    eventId: string,
    prizeId: string,
    input: unknown,
  ) {
    z.uuid().parse(eventId);
    z.uuid().parse(prizeId);
    const values = prizePublicationSchema.parse(input);
    this.authorization.requireRecent(actor);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      this.events.requireCapability(event, "events.publish");
      const row = (await this.rows(organizationId, eventId, tx)).find(
        (item) => item.id === prizeId,
      );
      if (!row || row.version !== values.expectedVersion) throw this.changed();
      let publishedRevisionId: string | null = null;
      let assets: string[] = [];
      if (values.operation === "publish") {
        this.events.requireActive(event);
        if (event.archived)
          throw new DomainError(
            "EVENT_ARCHIVED",
            "Archived events are read-only.",
            409,
          );
        await this.modules.requireEnabled(
          organizationId,
          eventId,
          "prizes",
          tx,
        );
        const snapshot = prizeDraftSchema.parse(row.draft);
        await this.references(organizationId, snapshot, tx);
        const [revision] = await tx
          .insert(eventPrizeRevision)
          .values({
            prizeId,
            eventId,
            organizationId,
            snapshot,
            createdBy: actor.userId,
          })
          .returning({ id: eventPrizeRevision.id });
        publishedRevisionId = revision.id;
        assets = snapshot.imageId ? [snapshot.imageId] : [];
        // Retained revisions protect file deletion without keeping old images public forever.
        await this.media.replaceUsage(
          `prize-revision:${revision.id}`,
          organizationId,
          assets,
          tx,
        );
      }
      await tx
        .update(eventPrize)
        .set({
          publishedRevisionId,
          version: row.version + 1,
        })
        .where(eq(eventPrize.id, prizeId));
      await this.media.replaceUsage(
        `prize:${prizeId}:published`,
        organizationId,
        assets,
        tx,
        true,
      );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: `event.prize.${values.operation === "publish" ? "published" : "unpublished"}`,
        targetId: prizeId,
      });
      return this.workspace(actor, eventId, tx);
    });
  }

  async published(
    actor: TrustedActor | null,
    eventId: string,
  ): Promise<PublicPrize[]> {
    z.uuid().parse(eventId);
    try {
      return await this.db.transaction(
        async (tx) => {
          const { organizationId } = await this.access.require(
            actor,
            eventId,
            "prizes",
            tx,
          );
          return this.reader.published(organizationId, eventId, tx);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    } catch (error) {
      if (error instanceof DomainError && error.status === 404) return [];
      throw error;
    }
  }
}
