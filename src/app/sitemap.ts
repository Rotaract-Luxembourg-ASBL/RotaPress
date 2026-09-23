import type { MetadataRoute } from "next";
import { services } from "@/composition/services";
import { config } from "@/core/config";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await services.cms.publicSitemap();
  const sites = new Map(
    await Promise.all(
      [...new Set(pages.map((page) => page.locale))].map(
        async (locale) =>
          [locale, await services.cms.publicSite(locale)] as const,
      ),
    ),
  );
  return pages
    .filter((page) => sites.get(page.locale)?.seo?.indexable !== false)
    .map((page) => ({
      url:
        sites.get(page.locale)?.eventsPageId === page.id
          ? `${config.APP_URL}/events?locale=${page.locale}`
          : `${config.APP_URL}/pages/${page.locale}/${page.slug}`,
      lastModified: page.updatedAt,
    }));
}
