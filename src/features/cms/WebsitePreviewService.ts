import "server-only";
import { z } from "zod";
import type {
  AuthorizationService,
  TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { DomainError } from "@/core/authorization/AuthorizationService";
import type { CmsService } from "./CmsService";
import { appearanceOf } from "./appearance";
import {
  cmsDataSchema,
  cmsLocaleSchema,
  type CmsData,
  type PublicPage,
  type PublicSite,
} from "./cms_schemas";
import type { PageCard } from "./page_collection";
import {
  kitIdSchema,
  kitRecipes,
  recipeIdSchema,
  kits,
} from "./kits/catalogue";
import { copyKitRecipe } from "./kits/recipes";
import type { OrganizationRepository } from "@/core/organization/OrganizationRepository";

const selectedInput = z.strictObject({
  locale: cmsLocaleSchema,
  pageId: z.uuid().optional(),
});
const templateInput = z.strictObject({
  kitId: kitIdSchema,
  locale: cmsLocaleSchema,
  recipe: recipeIdSchema.default("home"),
});
export type WebsitePreview = {
  page: PublicPage;
  site: PublicSite;
  cards: PageCard[];
  contactFormPreviewId?: string;
};

/** Authorized render projections only: previewing a template never creates CMS records. */
export class WebsitePreviewService {
  constructor(
    private readonly cms: CmsService,
    private readonly authorization: AuthorizationService,
    private readonly organization: OrganizationRepository,
  ) {}

  async selected(actor: TrustedActor, input: unknown): Promise<WebsitePreview> {
    const parsed = selectedInput.parse(input);
    await this.authorization.require(actor, "cms.edit");
    const [settings, contents] = await Promise.all([
      this.cms.getSite(actor, parsed.locale),
      this.cms.list(actor),
    ]);
    const draft = settings.draft;
    const items = contents.filter(
      (item) => item.locale === parsed.locale && !item.archived,
    );
    const pageId =
      parsed.pageId ??
      draft.homePageId ??
      items.find((item) => item.kind === "page" && item.slug === "home")?.id;
    if (
      !pageId ||
      !items.some((item) => item.id === pageId && item.kind === "page")
    )
      throw new DomainError(
        "WEBSITE_PREVIEW_EMPTY",
        "Choose a home page or a page to preview first.",
        404,
      );
    const href = (id: string) =>
      `/admin/website/preview?locale=${parsed.locale}&pageId=${encodeURIComponent(id)}`;
    const links = new Map(
      items
        .filter((item) => item.kind === "page")
        .map((item) => [`/pages/${parsed.locale}/${item.slug}`, href(item.id)]),
    );
    const rewrite = (data: CmsData) =>
      cmsDataSchema.parse(
        JSON.parse(
          JSON.stringify(data, (_key, value: unknown) =>
            typeof value === "string" ? (links.get(value) ?? value) : value,
          ),
        ),
      );
    const selected = draft.templateSetup?.installations.find(
      (item) => item.kitId === draft.templateSetup?.selectedKitId,
    );
    const previewIds = new Set([
      pageId,
      draft.homePageId,
      draft.eventsPageId,
      ...draft.navigation.flatMap((item) =>
        "pageId" in item ? [item.pageId] : [],
      ),
      ...(selected?.recipes.map((item) => item.id) ?? []),
    ]);
    const cards: PageCard[] = [];
    for (const item of items.filter(
      (item) => item.kind === "page" && previewIds.has(item.id),
    )) {
      const page = await this.cms.preview(actor, item.id, parsed.locale);
      cards.push({
        id: page.id,
        title: page.title,
        description: page.description,
        assetId: page.socialImageId,
        href: href(page.id),
      });
    }
    const page = await this.cms.preview(actor, pageId, parsed.locale);
    const parts: Pick<PublicSite, "header" | "footer"> = {
      header: null,
      footer: null,
    };
    for (const kind of ["header", "footer"] as const) {
      const id =
        draft[`${kind}Id`] ??
        items.find(
          (item) =>
            item.kind === kind && !item.kitId && item.publishedRevisionId,
        )?.id;
      if (id) {
        const item = items.find((item) => item.id === id && item.kind === kind);
        if (!item)
          throw new DomainError(
            "SITE_PART_INVALID",
            `Choose an active ${kind} in this language.`,
            422,
          );
        parts[kind] = rewrite(
          (await this.cms.preview(actor, id, parsed.locale)).data,
        );
      }
    }
    const navigation = draft.navigation.flatMap((item) =>
      "pageId" in item
        ? items.some((page) => page.id === item.pageId && page.kind === "page")
          ? [{ label: item.label, href: href(item.pageId) }]
          : []
        : [
            {
              label: item.label,
              href: draft.eventsPageId
                ? href(draft.eventsPageId)
                : `/events?locale=${parsed.locale}`,
            },
          ],
    );
    return {
      page: { ...page, data: rewrite(page.data) },
      site: {
        ...parts,
        ...appearanceOf(draft),
        branding: draft.branding,
        footerText: draft.footerText,
        socialLinks: draft.socialLinks,
        navigation,
        homeHref: href(draft.homePageId ?? page.id),
      },
      cards,
    };
  }

  async template(actor: TrustedActor, input: unknown): Promise<WebsitePreview> {
    const parsed = templateInput.parse(input);
    const template = kits[parsed.kitId];
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    const { draft } = await this.cms.getSite(actor, parsed.locale);
    if (
      !template.websiteRecipes.some((recipe) => recipe === parsed.recipe) ||
      parsed.recipe === "header" ||
      parsed.recipe === "footer"
    )
      throw new DomainError(
        "TEMPLATE_PREVIEW_PAGE",
        "Choose a website page in this template.",
        404,
      );
    const ids = new Map(
      template.websiteRecipes.map((recipe) => [recipe, crypto.randomUUID()]),
    );
    const href = (recipe: string) =>
      `/admin/website/preview?template=${parsed.kitId}&locale=${parsed.locale}&recipe=${recipe}`;
    const context = {
      kit: parsed.kitId,
      contactFormId: crypto.randomUUID(),
      timezone: (await this.organization.settings(organizationId))?.timezone,
      calendarEnabled: await this.authorization.features.enabled(
        organizationId,
        "calendar",
      ),
      links: Object.fromEntries(
        template.websiteRecipes.map((recipe) => [recipe, href(recipe)]),
      ),
      projectIds: [ids.get("project-detail")!],
    };
    const pages = template.websiteRecipes
      .filter((recipe) => recipe !== "header" && recipe !== "footer")
      .map((recipe): PublicPage => ({
        id: ids.get(recipe)!,
        kind: "page",
        locale: parsed.locale,
        title: kitRecipes.find((item) => item.id === recipe)!.name,
        slug: recipe,
        description: "",
        socialImageId: null,
        data: copyKitRecipe(recipe, context),
        sections: {},
      }));
    return {
      page: pages.find((page) => page.slug === parsed.recipe)!,
      contactFormPreviewId: context.contactFormId,
      site: {
        header: copyKitRecipe("header", context),
        footer: copyKitRecipe("footer", context),
        homeHref: href("home"),
        themeId: parsed.kitId,
        accentColor: draft.accentColor,
        font: draft.font,
        branding: draft.branding,
        footerText: "",
        socialLinks: [],
        navigation: template.menuRecipes.map((recipe) => ({
          label: kitRecipes.find((item) => item.id === recipe)!.name,
          href: href(recipe),
        })),
      },
      cards: pages.map((page) => ({
        id: page.id,
        title: page.title,
        description: page.description,
        assetId: null,
        href: href(page.slug),
      })),
    };
  }
}
