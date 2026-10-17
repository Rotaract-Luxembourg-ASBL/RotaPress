import "server-only";
import { z } from "zod";
import {
  DomainError,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { appearanceOf } from "./appearance";
import { contentSections } from "./cms_validation";
import type { CmsService } from "./CmsService";
import type { CmsData, CmsLocale, PublicPage, PublicSite } from "./cms_schemas";

export const compositionInput = z.strictObject({
  expectedSiteVersion: z.number().int().nonnegative(),
  parts: z
    .array(z.strictObject({ id: z.uuid(), expectedRevisionId: z.uuid() }))
    .max(82)
    .refine(
      (parts) => new Set(parts.map((part) => part.id)).size === parts.length,
    ),
});
export type PreviewComposition = z.infer<typeof compositionInput>;

/** Composition is opt-in and uses exact saved revisions; ordinary preview stays page-only. */
export class CmsCompositionPreview {
  constructor(private readonly cms: CmsService) {}

  private async sources(
    actor: TrustedActor,
    id: string,
    locale: CmsLocale,
    data: CmsData,
  ) {
    const settings = await this.cms.getSite(actor, locale);
    const items = await this.cms.list(actor);
    const parts: { id: string; kind: "section" | "header" | "footer" }[] =
      contentSections(data).map((id) => ({ id, kind: "section" }));
    for (const kind of ["header", "footer"] as const) {
      const partId =
        settings.draft[`${kind}Id`] ??
        items.find(
          (item) =>
            item.kind === kind &&
            item.locale === locale &&
            !item.archived &&
            !item.kitId &&
            item.publishedRevisionId,
        )?.id;
      if (partId && partId !== id) parts.push({ id: partId, kind });
    }
    return { settings, items, parts };
  }

  async review(
    actor: TrustedActor,
    id: string,
    locale: CmsLocale,
    data: CmsData,
  ): Promise<PreviewComposition> {
    const source = await this.sources(actor, id, locale, data);
    const parts = await Promise.all(
      source.parts.map(async (part) => {
        const detail = await this.cms.detail(actor, part.id, locale);
        if (detail.archived || detail.event || detail.kind !== part.kind)
          throw new DomainError(
            "PREVIEW_PART_INVALID",
            "Choose active website sections and site parts for this preview.",
            422,
          );
        return { id: part.id, expectedRevisionId: detail.draft.id };
      }),
    );
    return { expectedSiteVersion: source.settings.version, parts };
  }

  async project(
    actor: TrustedActor,
    id: string,
    locale: CmsLocale,
    data: CmsData,
    expected: PreviewComposition,
  ) {
    const source = await this.sources(actor, id, locale, data);
    if (
      source.settings.version !== expected.expectedSiteVersion ||
      source.parts.length !== expected.parts.length ||
      source.parts.some(
        (part) => !expected.parts.some((item) => item.id === part.id),
      )
    )
      this.conflict();
    const parts: Pick<PublicSite, "header" | "footer"> = {
      header: null,
      footer: null,
    };
    const sections: Record<string, CmsData> = {};
    const partners: NonNullable<PublicPage["partners"]> = {};
    for (const part of source.parts) {
      const detail = await this.cms.detail(actor, part.id, locale);
      if (
        detail.archived ||
        detail.event ||
        detail.kind !== part.kind ||
        detail.draft.id !==
          expected.parts.find((item) => item.id === part.id)?.expectedRevisionId
      )
        this.conflict();
      const page = await this.cms.preview(actor, part.id, locale);
      if (part.kind === "section") sections[part.id] = page.data;
      else parts[part.kind] = page.data;
      Object.assign(partners, page.partners);
    }
    const draft = source.settings.draft;
    const href = (pageId: string) => {
      const page = source.items.find(
        (item) =>
          item.id === pageId &&
          item.kind === "page" &&
          item.locale === locale &&
          !item.archived,
      );
      if (!page)
        throw new DomainError(
          "PREVIEW_PAGE_INVALID",
          "A draft menu or homepage references an unavailable page.",
          422,
        );
      return `/pages/${locale}/${page.slug}`;
    };
    const site: PublicSite = {
      ...parts,
      ...appearanceOf(draft),
      branding: draft.branding,
      seo: draft.seo,
      footerText: draft.footerText,
      socialLinks: draft.socialLinks,
      eventsPageId: draft.eventsPageId,
      homeHref: draft.homePageId
        ? href(draft.homePageId)
        : `/?locale=${locale}`,
      navigation: draft.navigation.map((item) => ({
        label: item.label,
        href:
          "pageId" in item
            ? href(item.pageId)
            : item.systemPage === "events"
              ? draft.eventsPageId
                ? href(draft.eventsPageId)
                : `/events?locale=${locale}`
              : `/${item.systemPage}`,
      })),
    };
    return { site, sections, partners };
  }

  private conflict(): never {
    throw new DomainError(
      "COMPOSITION_CONFLICT",
      "Website settings or a shared draft changed. Refresh the combined preview to review their latest versions.",
      409,
    );
  }
}
