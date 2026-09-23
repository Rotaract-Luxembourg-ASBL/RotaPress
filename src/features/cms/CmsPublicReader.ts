import "server-only";
import type { DatabaseExecutor } from "../../core/authorization/AuthorizationService";
import { z } from "zod";
import { cmsRevision } from "../../../db/schema/cms";
import { DomainError } from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { PageCard } from "./page_collection";
import { MediaService } from "../media";
import { PartnerReader } from "../partners/PartnerReader";
import { CmsRepository } from "./CmsRepository";
import {
  cmsLocaleSchema,
  siteSettingsSchema,
  slugSchema,
  type CmsData,
  type CmsLocale,
  type PublicPage,
  type CmsKind,
} from "./cms_schemas";
import {
  contentAssets,
  contentSections,
  contentPartners,
  dynamicProfileCategories,
  validateContent,
  revisionDto,
} from "./cms_validation";
type Revision = typeof cmsRevision.$inferSelect;

/** Explicit published projections. Draft preview calls project only after service authorization. */
export class CmsPublicReader {
  constructor(
    private readonly db: Database,
    private readonly repository: CmsRepository,
    private readonly media: MediaService,
  ) {}

  async publicPage(
    rawLocale: unknown,
    rawSlug: unknown,
  ): Promise<PublicPage | null> {
    const parsed = z
      .strictObject({ locale: cmsLocaleSchema, slug: slugSchema })
      .safeParse({ locale: rawLocale, slug: rawSlug });
    if (!parsed.success) return null;
    const organizationId = await this.repository.organizationId();
    if (!organizationId) return null;
    const rows = await this.repository.published(
      organizationId,
      parsed.data.locale,
    );
    const page = rows.find(
      (row) => row.kind === "page" && row.revision.slug === parsed.data.slug,
    );
    if (!page) return null;
    return this.safePublicProjection(
      organizationId,
      page.id,
      page.locale,
      page.revision,
    );
  }

  async publicHome(
    rawLocale: unknown,
  ): Promise<{ configured: boolean; page: PublicPage | null }> {
    const locale = cmsLocaleSchema.parse(rawLocale);
    const organizationId = await this.repository.organizationId();
    if (!organizationId) return { configured: false, page: null };
    const site = await this.repository.site(organizationId, locale);
    const settings = site?.published
      ? siteSettingsSchema.parse(site.published)
      : null;
    const rows = await this.repository.published(organizationId, locale);
    const home = rows.find(
      (row) =>
        row.kind === "page" &&
        (settings?.homePageId
          ? row.id === settings.homePageId
          : row.revision.slug === "home"),
    );
    if (home)
      return {
        configured: true,
        page: await this.safePublicProjection(
          organizationId,
          home.id,
          locale,
          home.revision,
        ),
      };
    // Draft creation must not remove the installation's existing public identity.
    // Once a CMS home was published, unpublishing it must not restore old content.
    return {
      configured:
        Boolean(settings?.homePageId) ||
        (await this.repository.homeWasPublished(organizationId, locale)),
      page: null,
    };
  }

  async pageCards(rawLocale: unknown): Promise<PageCard[]> {
    const locale = cmsLocaleSchema.parse(rawLocale);
    const organizationId = await this.repository.organizationId();
    if (!organizationId) return [];
    const rows = await this.repository.published(organizationId, locale);
    const cards: PageCard[] = [];
    for (const row of rows) {
      if (row.kind !== "page") continue;
      const page = await this.safePublicProjection(
        organizationId,
        row.id,
        locale,
        row.revision,
      );
      if (page)
        cards.push({
          id: page.id,
          title: page.title,
          description: page.description,
          assetId: page.socialImageId,
          href: `/pages/${locale}/${page.slug}`,
        });
    }
    return cards;
  }

  async publicEventsPage(
    rawLocale: unknown,
  ): Promise<{ configured: boolean; page: PublicPage | null }> {
    const locale = cmsLocaleSchema.parse(rawLocale);
    const organizationId = await this.repository.organizationId();
    if (!organizationId) return { configured: false, page: null };
    const site = await this.repository.site(organizationId, locale);
    const id = site?.published
      ? siteSettingsSchema.parse(site.published).eventsPageId
      : null;
    if (!id) return { configured: false, page: null };
    const rows = await this.repository.published(organizationId, locale);
    const page = rows.find((row) => row.id === id && row.kind === "page");
    return {
      configured: true,
      page: page
        ? await this.safePublicProjection(
            organizationId,
            id,
            locale,
            page.revision,
          )
        : null,
    };
  }

  async publicSitemap(): Promise<
    { id: string; locale: CmsLocale; slug: string; updatedAt: Date }[]
  > {
    const organizationId = await this.repository.organizationId();
    if (!organizationId) return [];
    const rows = await this.repository.published(organizationId);
    const result: {
      id: string;
      locale: CmsLocale;
      slug: string;
      updatedAt: Date;
    }[] = [];
    for (const row of rows) {
      if (row.kind !== "page") continue;
      const page = await this.safePublicProjection(
        organizationId,
        row.id,
        row.locale,
        row.revision,
      );
      if (page)
        result.push({
          id: page.id,
          locale: row.locale,
          slug: page.slug,
          updatedAt: row.revision.createdAt,
        });
    }
    return result;
  }

  async project(
    organizationId: string,
    id: string,
    locale: CmsLocale,
    revision: Revision,
    kind: CmsKind,
    requirePublic: boolean,
    executor: DatabaseExecutor = this.db,
  ): Promise<PublicPage> {
    const draft = revisionDto(revision, kind);
    const sections: Record<string, CmsData> = {};
    const assets = new Set(contentAssets(draft.data, draft.socialImageId));
    for (const sectionId of contentSections(draft.data)) {
      const content = await this.repository.content(
        organizationId,
        sectionId,
        executor,
      );
      const variant = await this.repository.variant(
        organizationId,
        sectionId,
        locale,
        executor,
      );
      const shared =
        content?.kind === "section" &&
        !content.archivedAt &&
        variant?.publishedRevisionId
          ? await this.repository.revision(
              variant.id,
              variant.publishedRevisionId,
              executor,
            )
          : null;
      if (!shared) {
        if (requirePublic)
          throw new DomainError(
            "SECTION_UNAVAILABLE",
            "Published section unavailable.",
            404,
          );
        continue;
      }
      const data = validateContent(shared.data, "section");
      sections[sectionId] = data;
      contentAssets(data).forEach((asset) => assets.add(asset));
    }
    if (requirePublic)
      await this.media.assertPublicAssets(
        organizationId,
        [...assets],
        executor,
      );
    const partnerIds = [
      ...new Set(
        [draft.data, ...Object.values(sections)].flatMap(contentPartners),
      ),
    ];
    const reader = new PartnerReader();
    if (requirePublic)
      await reader.assertReferences(organizationId, partnerIds, true, executor);
    const categories = [draft.data, ...Object.values(sections)].flatMap(
      dynamicProfileCategories,
    );
    const publishedPartners = await reader.published(
      organizationId,
      executor,
      categories.length ? undefined : partnerIds,
    );
    const partners = publishedPartners.filter(
      (profile) =>
        partnerIds.includes(profile.id) ||
        categories.includes("all") ||
        categories.includes(profile.category),
    );
    if (requirePublic)
      await this.media.assertPublicAssets(
        organizationId,
        partners.flatMap((partner) => (partner.logoId ? [partner.logoId] : [])),
        executor,
      );
    return {
      id,
      kind,
      revisionId: revision.id,
      title: draft.title,
      slug: draft.slug,
      locale,
      description: draft.description,
      socialImageId: draft.socialImageId,
      data: draft.data,
      sections,
      partners: Object.fromEntries(
        partners.map((partner) => [partner.id, partner]),
      ),
    };
  }

  private async safePublicProjection(
    organizationId: string,
    id: string,
    locale: CmsLocale,
    revision: Revision,
  ) {
    try {
      return await this.project(
        organizationId,
        id,
        locale,
        revision,
        "page",
        true,
      );
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof DomainError)
        return null;
      throw error;
    }
  }
}
