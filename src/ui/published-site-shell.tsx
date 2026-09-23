import type { ReactNode } from "react";
import { services } from "@/composition/services";
import { PublicSiteShell } from "./public-site-shell";

/** Read only the published website projection; account data stays in scoped APIs. */
export async function PublishedSiteShell({
  children,
}: {
  children: ReactNode;
}) {
  const club = await services.organization.publicIdentity();
  const locale = club?.locale ?? "en";
  const site = await services.cms.publicSite(locale);
  return (
    <PublicSiteShell
      site={site}
      club={club}
      locale={locale}
      className="public-utility-page"
    >
      {children}
    </PublicSiteShell>
  );
}
