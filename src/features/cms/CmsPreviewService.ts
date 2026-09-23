import "server-only";
import { and, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { cmsPreview } from "../../../db/schema/editorial-history";
import {
  DomainError,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { MediaService } from "../media/MediaService";
import { EventService } from "../events/EventService";
import {
  eventFields,
  eventFieldsSchema,
  eventVersionSchema,
} from "../events/event_schemas";
import { CmsService } from "./CmsService";
import { CmsPublicReader } from "./CmsPublicReader";
import { CmsRepository } from "./CmsRepository";
import { saveInput } from "./cms_commands";
import { cmsLocaleSchema } from "./cms_schemas";

const previewInput = saveInput.extend({
  event: eventVersionSchema.extend({ fields: eventFieldsSchema }).optional(),
});

/** Ephemeral input uses the normal scope/content policy and the real public projector. */
export class CmsPreviewService {
  private readonly reader: CmsPublicReader;
  constructor(
    private readonly db: Database,
    private readonly cms: CmsService,
    private readonly events: EventService,
    media: MediaService,
  ) {
    this.reader = new CmsPublicReader(db, new CmsRepository(db), media);
  }

  async create(actor: TrustedActor, input: unknown) {
    const parsed = previewInput.parse(input);
    const { event: eventInput, ...draft } = parsed;
    return this.db.transaction(async (tx) => {
      const prepared = await this.cms.drafts.prepare(actor, draft, tx);
      const event = prepared.content.eventId
        ? await this.events.detail(actor, prepared.content.eventId, tx)
        : null;
      if (eventInput && eventInput.id !== event?.id)
        throw new DomainError(
          "PREVIEW_SCOPE",
          "Choose a page belonging to this event.",
          403,
        );
      if (eventInput && event)
        this.events.requireEditableVersion(event, eventInput.expectedVersion);
      if (
        eventInput?.fields.endsAt &&
        new Date(eventInput.fields.endsAt) <=
          new Date(eventInput.fields.startsAt)
      )
        throw new DomainError(
          "EVENT_DATE_ORDER",
          "The end must be after the start.",
          422,
        );
      const payload = {
        ...draft,
        data: prepared.draft.data,
        ...(event
          ? {
              event: {
                id: event.id,
                expectedVersion: event.version,
                fields: eventInput?.fields ?? eventFields(event),
              },
            }
          : {}),
      };
      // One active snapshot per page/session; expired records are reclaimed on use.
      await tx
        .delete(cmsPreview)
        .where(
          or(
            lt(cmsPreview.expiresAt, new Date()),
            and(
              eq(cmsPreview.userId, actor.userId),
              eq(cmsPreview.sessionId, actor.sessionId),
              eq(cmsPreview.contentId, draft.id),
            ),
          ),
        );
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const [snapshot] = await tx
        .insert(cmsPreview)
        .values({
          contentId: draft.id,
          organizationId: prepared.organizationId,
          userId: actor.userId,
          sessionId: actor.sessionId,
          payload,
          expiresAt,
        })
        .returning({ id: cmsPreview.id });
      return {
        url: `/admin/website/${draft.id}/preview?locale=${draft.locale}&snapshot=${snapshot.id}`,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async createEvent(actor: TrustedActor, input: unknown) {
    const parsed = eventVersionSchema
      .extend({
        fields: eventFieldsSchema,
        locale: cmsLocaleSchema.default("en"),
      })
      .parse(input);
    await this.events.detail(actor, parsed.id);
    const pages = await this.cms.eventPages(actor, parsed.id);
    const page = pages.find(
      (item) =>
        item.moduleKey === "website" &&
        item.locale === parsed.locale &&
        !item.archived,
    );
    if (!page)
      throw new DomainError(
        "EVENT_PREVIEW_PAGE",
        "Create a Website page in this language to preview the event.",
        409,
      );
    const detail = await this.cms.detail(actor, page.id, parsed.locale);
    return this.create(actor, {
      id: page.id,
      locale: parsed.locale,
      expectedRevisionId: detail.draft.id,
      title: detail.draft.title,
      slug: detail.draft.slug,
      description: detail.draft.description,
      socialImageId: detail.draft.socialImageId,
      data: detail.draft.data,
      event: {
        id: parsed.id,
        expectedVersion: parsed.expectedVersion,
        fields: parsed.fields,
      },
    });
  }

  async read(
    actor: TrustedActor,
    contentId: string,
    locale: string,
    snapshotId: string,
  ) {
    const id = z.uuid().parse(snapshotId);
    const [snapshot] = await this.db
      .select()
      .from(cmsPreview)
      .where(
        and(
          eq(cmsPreview.id, id),
          eq(cmsPreview.contentId, contentId),
          eq(cmsPreview.userId, actor.userId),
          eq(cmsPreview.sessionId, actor.sessionId),
        ),
      );
    if (!snapshot || snapshot.expiresAt <= new Date())
      throw new DomainError(
        "PREVIEW_UNAVAILABLE",
        "This private preview expired. Return to the editor and preview again.",
        404,
      );
    const { event, ...draft } = previewInput.parse(snapshot.payload);
    if (draft.locale !== locale)
      throw new DomainError(
        "PREVIEW_UNAVAILABLE",
        "This preview is unavailable.",
        404,
      );
    // Recheck current assignment, feature availability and every asset on every read.
    const prepared = await this.db.transaction(async (tx) => {
      const value = await this.cms.drafts.prepare(actor, draft, tx);
      if (event) {
        const current = await this.events.detail(actor, event.id, tx);
        this.events.requireEditableVersion(current, event.expectedVersion);
      }
      return value;
    });
    const page = await this.reader.project(
      prepared.organizationId,
      draft.id,
      draft.locale,
      {
        ...prepared.draft,
        id: snapshot.id,
        variantId: prepared.variant.id,
        createdBy: actor.userId,
        createdAt: new Date(),
      },
      prepared.content.kind,
      false,
    );
    return { page, event: event?.fields ?? null };
  }
}
