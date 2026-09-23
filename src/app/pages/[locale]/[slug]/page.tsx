import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { services } from "@/composition/services";
import { cmsLocaleSchema } from "@/features/cms/cms_schemas";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { publicMetadata } from "@/features/cms/public_metadata";
import { config } from "@/core/config";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ locale: string; slug: string }> };

async function published(context: Context) {
  const { locale: language, slug } = await context.params;
  const locale = cmsLocaleSchema.safeParse(language);
  if (!locale.success) notFound();
  const page = await services.cms.publicPage(locale.data, slug);
  if (!page) notFound();
  return page;
}

export async function generateMetadata(context: Context): Promise<Metadata> {
  const page = await published(context);
  const canonical = `${config.APP_URL}/pages/${page.locale}/${page.slug}`;
  return publicMetadata({
    title: page.title,
    description: page.description,
    socialImageId: page.socialImageId,
    canonical,
    origin: config.APP_URL,
    site: await services.cms.publicSite(page.locale),
  });
}

export default async function PublishedPage(context: Context) {
  const page = await published(context);
  const [club, site] = await Promise.all([
    services.organization.publicIdentity(),
    services.cms.publicSite(page.locale),
  ]);
  if (site.eventsPageId === page.id) redirect(`/events?locale=${page.locale}`);
  return <CmsPublicPage page={page} site={site} club={club} />;
}
