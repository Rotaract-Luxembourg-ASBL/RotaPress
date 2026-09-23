import Link from "next/link";
import { en } from "@/locales/en";
import type { PublicOrganization } from "@/core/organization/organization_schemas";
import type { PublicSite } from "@/features/cms/cms_schemas";
import { Arrow } from "./primitives";
import { PublicSiteShell } from "./public-site-shell";

export function PublicHome({
  club,
  site,
}: {
  club: PublicOrganization | null;
  site: PublicSite;
}) {
  const configured = Boolean(club);

  return (
    <PublicSiteShell site={site} club={club} locale={club?.locale ?? "en"}>
      <main id="main-content">
        <section className="home-hero content-width">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="status-dot" />
              {en.public.eyebrow}
            </p>
            <h1 lang={club?.locale || "en"}>
              {club?.tagline || en.public.emptyTitle}
            </h1>
            <p className="hero-description" lang={club?.locale || "en"}>
              {club?.description || en.public.emptyDescription}
            </p>
            <Link
              href={configured ? "/membership" : "/setup"}
              className="button button-accent"
            >
              {configured ? en.public.join : en.public.setup}
              <Arrow />
            </Link>
            <p className="hero-note">
              {configured
                ? "A shared purpose. A world of possibility."
                : "Your club. Your identity. Your own space."}
            </p>
          </div>
          <div className="community-art" aria-hidden="true">
            <div className="art-grid" />
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-center">
              <span>Better</span>
              <em>together.</em>
              <span className="art-asterisk">✳</span>
            </div>
            <div className="art-caption">PEOPLE · PURPOSE · POSSIBILITY</div>
          </div>
        </section>
        <section className="community-section content-width">
          <div>
            <p className="eyebrow">The heart of a club</p>
            <h2>
              Room for you.
              <br />
              Room to make a difference.
            </h2>
          </div>
          <div className="community-note">
            <span className="note-number" aria-hidden="true">
              01 / COMMUNITY
            </span>
            <h3>It starts with showing up.</h3>
            <p>
              Bring your ideas, your energy, and a little curiosity. A club is
              made by the people who choose to be part of it.
            </p>
            {configured && (
              <Link className="text-link" href="/membership">
                Find your place <Arrow />
              </Link>
            )}
          </div>
        </section>
      </main>
    </PublicSiteShell>
  );
}
