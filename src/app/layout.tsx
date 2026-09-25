import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { services } from "@/composition/services";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  // Club identity belongs to this running installation, never the build image.
  await connection();
  const club = await services.organization.publicIdentity();
  const site = club ? await services.cms.publicSite(club.locale) : null;
  const name = club?.name ?? "RotaPress";
  return {
    title: { default: site?.seo?.title || name, template: `%s | ${name}` },
    description:
      site?.seo?.description ||
      club?.description ||
      "A home for your club. Connect your community, welcome members, and make a difference together.",
    verification: site?.seo?.googleVerification
      ? { google: site.seo.googleVerification }
      : undefined,
    robots:
      site?.seo?.indexable === false
        ? { index: false, follow: true }
        : undefined,
    icons: site?.branding?.iconId
      ? {
          icon: [{ url: `/media/${site.branding.iconId}`, type: "image/webp" }],
        }
      : { icon: [{ url: "/brand/rotapress-icon.svg", type: "image/svg+xml" }] },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
