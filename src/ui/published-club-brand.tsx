import { services } from "@/composition/services";
import type { PublicOrganization } from "@/core/organization/organization_schemas";
import {
  SiteBrandBlock,
  SitePartProvider,
} from "@/features/cms/ui/site-part-blocks";

/** Application headers share the club's published identity, without its page theme. */
export async function PublishedClubBrand({
  club,
}: {
  club: PublicOrganization;
}) {
  const site = await services.cms.publicSite(club.locale);
  return (
    <SitePartProvider
      value={{
        clubName: club.name,
        site: {
          navigation: [],
          footerText: "",
          socialLinks: [],
          homeHref: site.homeHref,
          themeId: site.themeId,
          branding: site.branding,
        },
      }}
    >
      <SiteBrandBlock
        id="application-club-brand"
        version={1}
        assetId=""
        alt=""
        label=""
        showName
        logoSize="small"
      />
    </SitePartProvider>
  );
}
