import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cmsContent, cmsRevision, cmsVariant } from "../../../db/schema/cms";
import {
  AuthorizationService,
  DomainError,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { EventService } from "../events/EventService";
import { EventModuleService } from "../events/EventModuleService";
import {
  eventPageModuleKeySchema,
  type EventPageModuleKey,
} from "../events/event_modules";
import { MediaService } from "../media/MediaService";
import { CmsRepository } from "./CmsRepository";
import { CmsScopePolicy } from "./CmsScopePolicy";
import { CmsRevisionWriter } from "./CmsRevisionWriter";
import {
  cmsLocaleSchema,
  revisionInputSchema,
  type CmsData,
  type CmsLocale,
} from "./cms_schemas";
import { validateContent } from "./cms_validation";

export type EventPageCopy = {
  sourceId: string;
  revisionId: string;
  moduleKey: EventPageModuleKey;
  locale: CmsLocale;
  archived: boolean;
  draft: {
    title: string;
    slug: string;
    description: string;
    socialImageId: string | null;
    data: CmsData;
  };
};

/** CMS-owned copying: revalidates shared schemas and retains referenced public media. */
export class CmsEventCopyService {
  private readonly scope: CmsScopePolicy;
  private readonly revisions: CmsRevisionWriter;
  constructor(
    db: Database,
    authorization: AuthorizationService,
    media: MediaService,
    events: EventService,
    modules: EventModuleService,
  ) {
    this.scope = new CmsScopePolicy(
      db,
      authorization,
      new CmsRepository(db),
      events,
      modules,
      media,
    );
    this.revisions = new CmsRevisionWriter(media);
  }

  async snapshot(
    organizationId: string,
    eventId: string,
    tx: Transaction,
  ): Promise<EventPageCopy[]> {
    const rows = await tx
      .select({
        content: cmsContent,
        variant: cmsVariant,
        revision: cmsRevision,
      })
      .from(cmsContent)
      .leftJoin(
        cmsVariant,
        and(
          eq(cmsVariant.contentId, cmsContent.id),
          eq(cmsVariant.organizationId, organizationId),
        ),
      )
      .leftJoin(
        cmsRevision,
        and(
          eq(cmsRevision.id, cmsVariant.draftRevisionId),
          eq(cmsRevision.variantId, cmsVariant.id),
        ),
      )
      .where(
        and(
          eq(cmsContent.eventId, eventId),
          eq(cmsContent.organizationId, organizationId),
        ),
      )
      .orderBy(asc(cmsContent.id), asc(cmsVariant.locale))
      .limit(201);
    if (rows.length > 200)
      throw new DomainError(
        "EVENT_COPY_TOO_LARGE",
        "Copy at most 200 page variants in one event.",
        422,
      );
    const result: EventPageCopy[] = [];
    for (const row of rows) {
      if (!row.variant || !row.revision)
        throw new DomainError(
          "EVENT_COPY_INCOMPLETE",
          "A source page has no saved draft. Repair it before copying.",
          409,
        );
      const data = validateContent(row.revision.data, "page");
      const draft = revisionInputSchema.parse({
        title: row.revision.title,
        slug: row.revision.slug,
        description: row.revision.description,
        socialImageId: row.revision.socialImageId,
        data,
      });
      await this.scope.validate(row.content, data, draft.socialImageId, tx);
      result.push({
        sourceId: row.content.id,
        revisionId: row.revision.id,
        moduleKey: eventPageModuleKeySchema.parse(row.content.moduleKey),
        locale: cmsLocaleSchema.parse(row.variant.locale),
        archived: row.content.archivedAt !== null,
        draft,
      });
    }
    return result;
  }

  async createDrafts(
    actor: TrustedActor,
    organizationId: string,
    eventId: string,
    pages: EventPageCopy[],
    tx: Transaction,
    formIds: Map<string, string>,
  ) {
    const ids = new Map<string, string>();
    for (const page of pages) {
      const data = validateContent(
        {
          ...page.draft.data,
          content: page.draft.data.content.map((block) => {
            if (block.type !== "Form") return block;
            const formId = formIds.get(block.props.formId);
            if (!formId)
              throw new DomainError(
                "EVENT_COPY_FORM_REFERENCE",
                "A page references a form that cannot be copied. Review the source event.",
                409,
              );
            return { ...block, props: { ...block.props, formId } };
          }),
        },
        "page",
      );
      const draft = revisionInputSchema.parse({ ...page.draft, data });
      await this.scope.validate(
        { organizationId, eventId, moduleKey: page.moduleKey },
        data,
        draft.socialImageId,
        tx,
      );
      let id = ids.get(page.sourceId);
      if (!id) {
        const [content] = await tx
          .insert(cmsContent)
          .values({
            organizationId,
            eventId,
            moduleKey: page.moduleKey,
            kind: "page",
            archivedAt: page.archived ? new Date() : null,
          })
          .returning({ id: cmsContent.id });
        id = content.id;
        ids.set(page.sourceId, id);
      }
      await this.revisions.createVariant(
        tx,
        actor,
        organizationId,
        id,
        page.locale,
        draft,
      );
    }
  }
}
