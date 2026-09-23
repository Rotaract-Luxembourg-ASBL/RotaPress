import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cmsContent, cmsVariant } from "../../../db/schema/cms";
import {
  DomainError,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";
import { z } from "zod";
import { visibleEventContent } from "../events/event_design";
import { flattenBlocks, type CmsData } from "./cms_schemas";
import { validateContent } from "./cms_validation";
import type { CmsRepository } from "./CmsRepository";
import type { CmsPublicReader } from "./CmsPublicReader";

function placement(data: CmsData | null) {
  const blocks = data ? flattenBlocks(visibleEventContent(data).content) : [];
  return {
    registration: blocks.some((block) => block.type === "EventRegistration"),
    prizes: blocks.some((block) => block.type === "EventPrizes"),
    formIds: blocks.flatMap((block) =>
      block.type === "Form" ? [block.props.formId] : [],
    ),
  };
}

/** Internal CMS contract: callers authorize event scope; documents never leave this reader. */
export class CmsEventParticipationReader {
  constructor(
    private readonly repository: CmsRepository,
    private readonly publicReader: CmsPublicReader,
  ) {}

  async read(
    organizationId: string,
    eventId: string,
    executor: DatabaseExecutor,
  ) {
    const rows = await executor
      .select({
        id: cmsContent.id,
        moduleKey: cmsContent.moduleKey,
        variant: cmsVariant,
      })
      .from(cmsContent)
      .innerJoin(
        cmsVariant,
        and(
          eq(cmsVariant.contentId, cmsContent.id),
          eq(cmsVariant.organizationId, cmsContent.organizationId),
        ),
      )
      .where(
        and(
          eq(cmsContent.organizationId, organizationId),
          eq(cmsContent.eventId, eventId),
          isNull(cmsContent.archivedAt),
        ),
      );
    const result = [];
    for (const row of rows) {
      if (!row.moduleKey) continue;
      const draft = row.variant.draftRevisionId
        ? await this.repository.revision(
            row.variant.id,
            row.variant.draftRevisionId,
            executor,
          )
        : null;
      const published = row.variant.publishedRevisionId
        ? await this.repository.revision(
            row.variant.id,
            row.variant.publishedRevisionId,
            executor,
          )
        : null;
      let draftData: CmsData | null = null;
      let publishedData: CmsData | null = null;
      try {
        draftData = draft ? validateContent(draft.data, "page") : null;
      } catch (error) {
        if (!(error instanceof DomainError || error instanceof z.ZodError))
          throw error;
      }
      try {
        if (published)
          publishedData = (
            await this.publicReader.project(
              organizationId,
              row.id,
              row.variant.locale,
              published,
              "page",
              true,
              executor,
            )
          ).data;
      } catch (error) {
        if (!(error instanceof DomainError || error instanceof z.ZodError))
          throw error;
      }
      result.push({
        id: row.id,
        locale: row.variant.locale,
        moduleKey: row.moduleKey,
        pagePublished: publishedData !== null,
        draft: placement(draftData),
        published: placement(publishedData),
      });
    }
    return result;
  }
}
