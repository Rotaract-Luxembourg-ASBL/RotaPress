import "server-only";
import type { cmsContent } from "../../../db/schema/cms";
import type { Database } from "../../infrastructure/database/client";
import {
  DomainError,
  type DatabaseExecutor,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import type { FormService } from "../forms/FormService";
import { PartnerReader } from "../partners/PartnerReader";
import type { CmsRepository } from "./CmsRepository";
import {
  type AffectedPage,
  type CmsData,
  type CmsLocale,
  type CmsKind,
  isSitePart,
  siteSettingsSchema,
  flattenBlocks,
} from "./cms_schemas";
import {
  contentForms,
  contentPartners,
  contentSections,
  validateContent,
} from "./cms_validation";

/** Scoped reference validation shared by CMS saving, publication and restoration. */
export class CmsReferencePolicy {
  constructor(
    private readonly db: Database,
    private readonly repository: CmsRepository,
    private readonly forms: FormService,
  ) {}
  async validateReferences(
    organizationId: string,
    data: CmsData,
    locale: CmsLocale,
    published: boolean,
    executor: DatabaseExecutor,
    eventId: string | null = null,
  ) {
    for (const id of new Set(
      flattenBlocks(data.content).flatMap((block) =>
        block.type === "PageCollection" ? block.props.pageIds : [],
      ),
    )) {
      const page = await this.repository.content(organizationId, id, executor);
      const variant = await this.repository.variant(
        organizationId,
        id,
        locale,
        executor,
      );
      if (
        !page ||
        page.kind !== "page" ||
        page.eventId ||
        page.archivedAt ||
        !variant
      )
        throw new DomainError(
          "PAGE_REFERENCE_INVALID",
          "Choose an active club page in this language for each page card.",
          422,
        );
    }
    await new PartnerReader().assertReferences(
      organizationId,
      contentPartners(data),
      published,
      executor,
    );
    const formIds = contentForms(data);
    await this.forms.assertOwnedForms(
      organizationId,
      formIds,
      executor,
      eventId,
    );
    if (published)
      await this.forms.assertPublishedForms(
        organizationId,
        formIds,
        executor,
        eventId,
      );
    for (const id of contentSections(data)) {
      const section = await this.repository.content(
        organizationId,
        id,
        executor,
      );
      const variant = await this.repository.variant(
        organizationId,
        id,
        locale,
        executor,
      );
      if (
        !section ||
        section.kind !== "section" ||
        section.archivedAt ||
        !variant
      ) {
        throw new DomainError(
          "SECTION_NOT_FOUND",
          "Choose an active reusable section in this language.",
          422,
        );
      }
      if (published && !variant.publishedRevisionId) {
        throw new DomainError(
          "SECTION_NOT_PUBLISHED",
          "Publish each referenced reusable section in this language first.",
          422,
        );
      }
      if (published && variant.publishedRevisionId) {
        const shared = await this.repository.revision(
          variant.id,
          variant.publishedRevisionId,
          executor,
        );
        if (shared) {
          await new PartnerReader().assertReferences(
            organizationId,
            contentPartners(validateContent(shared.data, "section")),
            true,
            executor,
          );
          await this.forms.assertPublishedForms(
            organizationId,
            contentForms(validateContent(shared.data, "section")),
            executor,
          );
        }
      }
    }
  }

  async affectedPages(
    organizationId: string,
    sectionId: string,
    locale: CmsLocale,
    executor: DatabaseExecutor = this.db,
    kind: CmsKind = "section",
  ): Promise<AffectedPage[]> {
    const published = await this.repository.published(
      organizationId,
      locale,
      executor,
    );
    if (isSitePart(kind)) {
      const site = await this.repository.site(organizationId, locale, executor);
      const chosen = site?.published
        ? siteSettingsSchema.parse(site.published)[`${kind}Id`]
        : undefined;
      if (chosen && chosen !== sectionId) return [];
      if (!chosen) {
        const variant = await this.repository.variant(
          organizationId,
          sectionId,
          locale,
          executor,
        );
        const revision = variant?.draftRevisionId
          ? await this.repository.revision(
              variant.id,
              variant.draftRevisionId,
              executor,
            )
          : null;
        if (revision && validateContent(revision.data, kind).root.props.kit)
          return [];
      }
    }
    return published
      .filter(
        (row) =>
          row.kind === "page" &&
          (isSitePart(kind) ||
            contentSections(
              validateContent(row.revision.data, "page"),
            ).includes(sectionId)),
      )
      .map((row) => ({
        id: row.id,
        title: row.revision.title,
        locale: row.locale,
        slug: row.revision.slug,
      }));
  }

  async requireUnusedSection(
    organizationId: string,
    content: typeof cmsContent.$inferSelect,
    locale: CmsLocale,
    tx: Transaction,
  ) {
    if (
      content.kind === "section" &&
      (await this.affectedPages(organizationId, content.id, locale, tx)).length
    ) {
      throw new DomainError(
        "SECTION_IN_USE",
        "Remove this section from its published pages before unpublishing or archiving it.",
        409,
      );
    }
  }
}
