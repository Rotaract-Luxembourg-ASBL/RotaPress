import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { clubEvent } from "../../../db/schema/events";
import { eventRevision } from "../../../db/schema/editorial-history";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import { AuditRepository } from "../../core/audit/AuditRepository";
import type { Database } from "../../infrastructure/database/client";
import { CmsService } from "../cms/CmsService";
import { expectedInput } from "../cms/cms_commands";
import { EventService } from "./EventService";
import { EventModuleService } from "./EventModuleService";
import {
  EventRevisionWriter,
  revisionPagesSchema,
} from "./EventRevisionWriter";
import { eventFieldsSchema, eventVersionSchema } from "./event_schemas";

export class EventEditorialService {
  private readonly revisions = new EventRevisionWriter();
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly events: EventService,
    private readonly modules: EventModuleService,
    private readonly cms: CmsService,
  ) {}

  async history(actor: TrustedActor, id: string) {
    await this.events.detail(actor, z.uuid().parse(id));
    const { organizationId, capabilities } =
      await this.authorization.approved(actor);
    const rows = await this.db
      .select()
      .from(eventRevision)
      .where(
        and(
          eq(eventRevision.eventId, id),
          eq(eventRevision.organizationId, organizationId),
        ),
      )
      .orderBy(desc(eventRevision.createdAt), desc(eventRevision.id))
      .limit(100);
    const [featured] = capabilities.includes("events.manage")
      ? await this.db
          .select({
            id: clubEvent.id,
            title: clubEvent.title,
          })
          .from(clubEvent)
          .where(
            and(
              eq(clubEvent.organizationId, organizationId),
              eq(clubEvent.featured, true),
            ),
          )
      : [];
    return {
      revisions: rows.map((row) => ({
        id: row.id,
        action: row.action,
        version: row.eventVersion,
        title: eventFieldsSchema.parse(row.fields).title,
        createdAt: row.createdAt.toISOString(),
        pages: revisionPagesSchema.parse(row.pages),
      })),
      pages: await this.revisions.pages(this.db, organizationId, id),
      featured: featured ?? null,
    };
  }

  async restore(actor: TrustedActor, input: unknown) {
    const parsed = eventVersionSchema
      .extend({
        revisionId: z.uuid(),
        pages: z.array(expectedInput).max(12),
        confirmed: z.literal(true),
      })
      .parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        parsed.id,
        tx,
      );
      this.events.requireCapability(event, "events.edit");
      this.events.requireEditableVersion(event, parsed.expectedVersion);
      this.events.requireActive(event);
      const [old] = await tx
        .select()
        .from(eventRevision)
        .where(
          and(
            eq(eventRevision.id, parsed.revisionId),
            eq(eventRevision.eventId, event.id),
            eq(eventRevision.organizationId, organizationId),
          ),
        );
      if (!old)
        throw new DomainError(
          "EVENT_REVISION_NOT_FOUND",
          "This event revision is unavailable.",
          404,
        );
      const pages = revisionPagesSchema.parse(old.pages);
      if (parsed.pages.length !== pages.length)
        throw new DomainError(
          "EVENT_RESTORE_PAGES",
          "Review every recorded page before restoring.",
          409,
        );
      for (const page of pages) {
        const expected = parsed.pages.find(
          (item) => item.id === page.id && item.locale === page.locale,
        );
        if (!expected)
          throw new DomainError(
            "EVENT_RESTORE_PAGES",
            "A recorded page was not reviewed.",
            409,
          );
        await this.cms.drafts.restore(
          actor,
          { ...expected, revisionId: page.revisionId },
          tx,
        );
      }
      const fields = eventFieldsSchema.parse(old.fields);
      await tx
        .update(clubEvent)
        .set({
          ...fields,
          startsAt: new Date(fields.startsAt),
          endsAt: fields.endsAt ? new Date(fields.endsAt) : null,
          version: event.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(clubEvent.id, event.id));
      await this.revisions.append(
        tx,
        actor,
        organizationId,
        await this.events.detail(actor, event.id, tx),
        "restored",
      );
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.draft_restored",
        targetId: event.id,
      });
    });
    return this.events.detail(actor, parsed.id);
  }

  async feature(actor: TrustedActor, input: unknown) {
    const parsed = eventVersionSchema
      .extend({
        featured: z.boolean(),
        expectedFeaturedId: z.uuid().nullable(),
        confirmed: z.literal(true),
      })
      .parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.events.lockEvent(
        actor,
        parsed.id,
        tx,
      );
      await this.authorization.require(actor, "events.manage", tx);
      this.events.requireEditableVersion(event, parsed.expectedVersion);
      const [current] = await tx
        .select()
        .from(clubEvent)
        .where(
          and(
            eq(clubEvent.organizationId, organizationId),
            eq(clubEvent.featured, true),
          ),
        );
      if ((current?.id ?? null) !== parsed.expectedFeaturedId)
        throw new DomainError(
          "EVENT_FEATURED_CONFLICT",
          "The featured selection changed. Reload and review it again.",
          409,
        );
      if (parsed.featured) {
        this.events.requireActive(event);
        const [row] = await tx
          .select({ published: clubEvent.published })
          .from(clubEvent)
          .where(eq(clubEvent.id, event.id));
        if (
          !row.published ||
          eventFieldsSchema.parse(row.published).visibility !== "public"
        )
          throw new DomainError(
            "EVENT_FEATURED_UNAVAILABLE",
            "Publish this event with public visibility before featuring it.",
            409,
          );
        await this.modules.requireEnabled(
          organizationId,
          event.id,
          "website",
          tx,
        );
        await this.cms.requireEventLanding(organizationId, event.id, tx);
      }
      if (current && (parsed.featured || current.id === event.id))
        await tx
          .update(clubEvent)
          .set({
            featured: false,
            version: sql`${clubEvent.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(clubEvent.id, current.id));
      if (parsed.featured && current?.id !== event.id)
        await tx
          .update(clubEvent)
          .set({
            featured: true,
            version: event.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(clubEvent.id, event.id));
      else if (parsed.featured)
        await tx
          .update(clubEvent)
          .set({ featured: true })
          .where(eq(clubEvent.id, event.id));
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: parsed.featured ? "event.featured" : "event.unfeatured",
        targetId: event.id,
      });
    });
    return this.events.detail(actor, parsed.id);
  }
}
