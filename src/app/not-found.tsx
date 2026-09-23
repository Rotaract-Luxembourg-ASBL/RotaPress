import Link from "next/link";
import { connection } from "next/server";
import { services } from "@/composition/services";
import { cmsLocaleSchema, emptyCmsData } from "@/features/cms/cms_schemas";
import { CmsPublicPage } from "@/ui/cms-public-page";

export default async function NotFound() {
  // Keep the published identity and theme current instead of capturing build-time data.
  await connection();
  const club = await services.organization.publicIdentity();
  const locale = cmsLocaleSchema.parse(club?.locale ?? "en");
  return (
    <CmsPublicPage
      club={club}
      site={await services.cms.publicSite(locale)}
      showTitle={false}
      page={{
        id: "unavailable",
        kind: "page",
        locale,
        title: "Page unavailable",
        slug: "",
        description: "",
        socialImageId: null,
        data: emptyCmsData,
        sections: {},
      }}
      beforeContent={
        <section className="cms-block cms-page-intro">
          <p className="cms-eyebrow">404</p>
          <h1>This page is unavailable.</h1>
          <p>Return to the website to explore the club's published pages.</p>
          <Link className="button button-accent" href="/">
            Back to the website
          </Link>
        </section>
      }
    />
  );
}
