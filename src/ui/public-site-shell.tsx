import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { PublicOrganization } from "@/core/organization/organization_schemas";
import { websiteStyle } from "@/features/cms/appearance";
import type { CmsLocale, PublicSite } from "@/features/cms/cms_schemas";
import { RenderContent } from "@/features/cms/ui/public-content";
import {
  SiteBrandBlock,
  SitePartProvider,
} from "@/features/cms/ui/site-part-blocks";
import { Brand } from "./primitives";
import {
  PublicAccountLink,
  PublicAccountProvider,
  PublicAdministrationLink,
} from "./public-account-link";

/** Published chrome shared by content pages and the club's public account flows. */
export function PublicSiteShell({
  site,
  club,
  locale,
  children,
  preview = false,
  standalone = false,
  beforeHeader,
  className = "",
  eventAppearance,
}: {
  site: PublicSite;
  club: PublicOrganization | null;
  locale: CmsLocale;
  children: ReactNode;
  preview?: boolean;
  standalone?: boolean;
  beforeHeader?: ReactNode;
  className?: string;
  eventAppearance?: { style: CSSProperties; palette: string };
}) {
  return (
    <PublicAccountProvider preview={preview}>
      <SitePartProvider
        value={{ clubName: club?.name ?? "Your club", club, site }}
      >
        <div
          className={`public-site cms-public${eventAppearance ? " cms-event-page" : ""}${className ? ` ${className}` : ""}`}
          data-theme={eventAppearance ? undefined : site.themeId}
          data-event-palette={eventAppearance?.palette}
          style={eventAppearance?.style ?? websiteStyle(site)}
        >
          {beforeHeader}
          {!standalone &&
            (site.header ? (
              <header
                className={`cms-site-part site-header content-width${site.header.content.some((block) => block.type === "SiteRow" && block.props.sticky) ? " site-header-sticky" : ""}`}
                lang={locale}
              >
                <RenderContent data={site.header} preview={preview} />
              </header>
            ) : (
              <header className="public-header cms-site-part content-width">
                {club ? (
                  <SiteBrandBlock
                    id="public-site-identity"
                    version={1}
                    assetId=""
                    alt=""
                    label=""
                    showName
                    logoSize="medium"
                  />
                ) : (
                  <Brand />
                )}
                <nav aria-label="Website navigation">
                  {site.navigation.map((item) => (
                    <Link href={item.href} key={item.href}>
                      {item.label}
                    </Link>
                  ))}
                  <PublicAccountLink
                    href="/sign-in?next=/membership"
                    className="button button-small button-outline"
                  >
                    Member login
                  </PublicAccountLink>
                </nav>
              </header>
            ))}
          {children}
          {!standalone &&
            (site.footer ? (
              <footer
                className="cms-site-part site-footer content-width"
                lang={locale}
              >
                <RenderContent data={site.footer} preview={preview} />
              </footer>
            ) : (
              <footer className="public-footer content-width" lang={locale}>
                <span>{site.footerText || club?.name || "RotaPress"}</span>
                <span className="footer-links">
                  {site.socialLinks.map((item, index) => (
                    <a href={item.href} key={`${item.href}-${index}`}>
                      {item.label}
                    </a>
                  ))}
                  <PublicAdministrationLink />
                  <span>Made with RotaPress</span>
                </span>
              </footer>
            ))}
        </div>
      </SitePartProvider>
    </PublicAccountProvider>
  );
}
