import { PublicHome } from "@/ui/public-home";
import { services } from "@/composition/services";
import type { Metadata } from "next";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { cmsLocaleSchema } from "@/features/cms/cms_schemas";
import { notFound } from "next/navigation";
import { publicMetadata } from "@/features/cms/public_metadata";
import { config } from "@/core/config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const club = await services.organization.publicIdentity();
  if (!club) return {};
  const home = await services.cms.publicHome(
    cmsLocaleSchema.parse(club.locale),
  );
  const site = await services.cms.publicSite(club.locale);
  return publicMetadata({
    title: site.seo?.title || home.page?.title || "Home",
    clubName: club.name,
    description:
      home.page?.description || site.seo?.description || club.description,
    socialImageId: home.page?.socialImageId,
    canonical: config.APP_URL,
    origin: config.APP_URL,
    site,
  });
}

export default async function HomePage() {
  const club = await services.organization.publicIdentity();
  if (club) {
    const locale = cmsLocaleSchema.parse(club.locale);
    const home = await services.cms.publicHome(locale);
    if (home.page)
      return (
        <CmsPublicPage
          page={home.page}
          site={await services.cms.publicSite(locale)}
          club={club}
        />
      );
    if (home.configured) notFound();
  }
  return (
    <PublicHome
      club={club}
      site={await services.cms.publicSite(club?.locale ?? "en")}
    />
  );
}
