import type { CmsLocale, SiteSettings } from "./cms_schemas";
import type { WebsiteWorkspace } from "./website_setup_schemas";

export type WebsitePublicationScope = "website" | "menu";

/** The menu editor owns these fields; publishing it must not include other drafts. */
export function websiteMenu(settings: SiteSettings) {
  return {
    homePageId: settings.homePageId,
    eventsPageId: settings.eventsPageId,
    navigation: settings.navigation,
  };
}

export function websitePublicationItems(
  workspace: WebsiteWorkspace,
  scope: WebsitePublicationScope = "website",
) {
  const settings = workspace.site.draft;
  const part = (kind: "header" | "footer") =>
    settings[`${kind}Id`] ??
    workspace.contents.find(
      (item) =>
        item.kind === kind &&
        !item.archived &&
        !item.kitId &&
        item.publishedRevisionId,
    )?.id;
  const ids = new Set([
    settings.homePageId,
    settings.eventsPageId,
    ...settings.navigation.flatMap((item) =>
      "pageId" in item ? [item.pageId] : [],
    ),
    ...(scope === "website"
      ? [
          ...(workspace.selection?.contentIds ?? []),
          part("header"),
          part("footer"),
        ]
      : []),
  ]);
  return workspace.contents.filter(
    (item) => ids.has(item.id) && !item.archived,
  );
}

export type WebsitePublicationReview = {
  scope: WebsitePublicationScope;
  locale: CmsLocale;
  version: number;
  pages: {
    id: string;
    title: string;
    kind: string;
    expectedRevisionId: string;
    changed: boolean;
  }[];
  images: {
    id: string | null;
    name: string;
    status: "private" | "unavailable";
    uses: { label: string; href: string }[];
  }[];
  problems: { message: string; href?: string }[];
};
