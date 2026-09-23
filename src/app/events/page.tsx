import { notFound } from "next/navigation";
import { services } from "@/composition/services";
import { cmsLocaleSchema, emptyCmsData } from "@/features/cms/cms_schemas";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { eventPeriodSchema } from "@/features/events/event_catalogue";
import { EventDirectoryView } from "@/features/events/ui/event-directory-view";
import { defaultEventDirectoryDesign } from "@/features/events/event_directory";
import { publicMetadata } from "@/features/cms/public_metadata";
import { config } from "@/core/config";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const query = await searchParams;
  const parsed = cmsLocaleSchema.safeParse(query.locale ?? "en");
  if (!parsed.success) return {};
  const [site, binding, design] = await Promise.all([
    services.cms.publicSite(parsed.data),
    services.cms.publicEventsPage(parsed.data),
    services.eventDirectory.publicDesign(parsed.data),
  ]);
  return publicMetadata({
    site,
    title: design
      ? design.seoTitle || design.title
      : binding.page?.title || "Events",
    description: design
      ? design.seoDescription || design.introduction
      : binding.page?.description ||
        "Discover what is happening in our community.",
    socialImageId: design
      ? design.coverImageId
      : (binding.page?.socialImageId ?? null),
    canonical: `${config.APP_URL}/events?locale=${parsed.data}`,
    origin: config.APP_URL,
  });
}
export default async function Events({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; period?: string }>;
}) {
  const query = await searchParams;
  if (!(await services.authorization.features.installed()).events) notFound();
  const parsedLocale = cmsLocaleSchema.safeParse(query.locale ?? "en");
  if (!parsedLocale.success) notFound();
  const locale = parsedLocale.data;
  const [binding, publishedDesign] = await Promise.all([
    services.cms.publicEventsPage(locale),
    services.eventDirectory.publicDesign(locale),
  ]);
  const design = publishedDesign ?? defaultEventDirectoryDesign;
  const parsedPeriod = eventPeriodSchema.safeParse(
    query.period ?? design.defaultPeriod,
  );
  if (!parsedPeriod.success) notFound();
  if (!publishedDesign && binding.configured && !binding.page) notFound();
  const [events, site, club] = await Promise.all([
    services.eventWebsite.publicList(locale),
    services.cms.publicSite(locale),
    services.organization.publicIdentity(),
  ]);
  // Keep existing custom pages in place until a directory design is explicitly published.
  if (!publishedDesign && binding.page)
    return <CmsPublicPage club={club} site={site} page={binding.page} />;
  return (
    <CmsPublicPage
      showTitle={false}
      club={club}
      site={site}
      page={{
        id: "events",
        kind: "page",
        title: design.title,
        slug: "events",
        locale,
        description: design.introduction,
        socialImageId: design.coverImageId,
        data: emptyCmsData,
        sections: {},
      }}
      beforeContent={
        <EventDirectoryView
          design={design}
          events={events}
          locale={locale}
          period={parsedPeriod.data}
        />
      }
    />
  );
}
