import { notFound } from "next/navigation";
import { services } from "@/composition/services";
import { emptyCmsData } from "@/features/cms/cms_schemas";
import { CmsPublicPage } from "@/ui/cms-public-page";
import { CalendarPublic } from "@/features/calendar/ui/calendar-public";
import { publicMetadata } from "@/features/cms/public_metadata";
import { config } from "@/core/config";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const [site, design] = await Promise.all([
    services.cms.publicSite("en"),
    services.calendar.reader.page(),
  ]);
  return publicMetadata({
    clubName: (await services.organization.publicIdentity())?.name,
    site,
    title: design.title,
    description: design.introduction,
    socialImageId: null,
    canonical: config.APP_URL + "/calendar",
    origin: config.APP_URL,
  });
}
export default async function CalendarPage() {
  if (!(await services.authorization.features.installed()).calendar) notFound();
  const [design, club, site] = await Promise.all([
    services.calendar.reader.page(),
    services.organization.publicIdentity(),
    services.cms.publicSite("en"),
  ]);
  return (
    <CmsPublicPage
      showTitle={false}
      club={club}
      site={site}
      page={{
        id: "calendar",
        title: design.title,
        description: design.introduction,
        slug: "calendar",
        locale: "en",
        kind: "page",
        socialImageId: null,
        data: emptyCmsData,
        sections: {},
      }}
      beforeContent={<CalendarPublic design={design} />}
    />
  );
}
