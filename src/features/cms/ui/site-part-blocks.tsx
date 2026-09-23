"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PublicSite } from "../cms_schemas";
import { templateBrands } from "../template_brand";
import { resolveWebsiteBranding } from "../site_identity";
import { CmsImage, type BlockProps } from "./block-renderers";

export type SiteBlockContext = {
  clubName: string;
  site: Pick<
    PublicSite,
    "navigation" | "footerText" | "socialLinks" | "homeHref"
  > &
    Partial<Pick<PublicSite, "themeId" | "branding">>;
};
const Context = createContext<SiteBlockContext>({
  clubName: "",
  site: { navigation: [], footerText: "", socialLinks: [] },
});
export function SitePartProvider({
  value,
  children,
}: {
  value: SiteBlockContext;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function SiteBrandBlock(props: BlockProps<"SiteBrand">) {
  const { clubName, site } = useContext(Context);
  const name = props.label || clubName || "Your club";
  const identity = resolveWebsiteBranding(site, props.templateBrand);
  const assetId = props.assetId || identity.logoId;
  const alt = props.assetId ? props.alt : identity.logoAlt || name;
  const showName = props.assetId ? props.showName : identity.showName;
  const templateBrand = identity.mark ? templateBrands[identity.mark] : null;
  return (
    <div className={`site-brand site-logo-${props.logoSize}`}>
      {assetId ? (
        <Link href={site.homeHref || "/"} aria-label={`${name} home`}>
          <CmsImage id={assetId} alt={alt} className="site-logo" />
          {showName && <span className="site-brand-name">{name}</span>}
        </Link>
      ) : templateBrand ? (
        <Link
          className="template-brand-identity"
          href={site.homeHref || "/"}
          aria-label={`${name} home`}
        >
          <span className="template-brand-mark">
            <Image {...templateBrand} className="site-logo" unoptimized />
          </span>
          <span className="site-brand-name">{name}</span>
        </Link>
      ) : (
        <Link className="club-text-identity" href={site.homeHref || "/"}>
          {name}
        </Link>
      )}
    </div>
  );
}

export function SiteMenuBlock(props: BlockProps<"SiteMenu">) {
  const { site } = useContext(Context);
  const links = site.navigation.map((item, index) => (
    <a key={`${item.href}-${index}`} href={item.href}>
      {item.label}
    </a>
  ));
  const label = props.label || "Main menu";
  return (
    <div
      className={`site-menu site-menu-${props.layout}`}
      data-menu-ref={props.menuKey}
    >
      <nav className="site-menu-wide" aria-label={label}>
        {links}
      </nav>
      {props.layout === "horizontal" && (
        <details className="site-menu-compact">
          <summary>{label}</summary>
          <nav aria-label={label}>{links}</nav>
        </details>
      )}
    </div>
  );
}

export function SiteContactBlock(props: BlockProps<"SiteContact">) {
  return (
    <section className="site-contact">
      {props.title && <h2>{props.title}</h2>}
      <address>
        {props.address && <p>{props.address}</p>}
        {props.email && (
          <a href={`mailto:${encodeURIComponent(props.email)}`}>
            {props.email}
          </a>
        )}
        {props.phone && (
          <a href={`tel:${props.phone.replace(/[^+0-9]/g, "")}`}>
            {props.phone}
          </a>
        )}
      </address>
    </section>
  );
}
export function SiteSocialBlock(props: BlockProps<"SiteSocial">) {
  const { site } = useContext(Context);
  return (
    <nav className="site-social" aria-label={props.label || "Social links"}>
      {site.socialLinks.map((item, index) => (
        <a href={item.href} key={`${item.href}-${index}`}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
export function SiteFooterTextBlock() {
  const { site, clubName } = useContext(Context);
  return (
    <p className="site-footer-text">
      {site.footerText || clubName || "RotaPress"}
    </p>
  );
}
export function SiteRowBlock({
  layout,
  flow,
  spacing,
  left,
  center,
  right,
}: Pick<BlockProps<"SiteRow">, "layout" | "flow" | "spacing"> & {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  return (
    <div
      className={`site-row site-row-${layout} site-row-${flow} site-spacing-${spacing}`}
    >
      <div className="site-column site-column-left">{left}</div>
      <div className="site-column site-column-center">{center}</div>
      <div className="site-column site-column-right">{right}</div>
    </div>
  );
}
