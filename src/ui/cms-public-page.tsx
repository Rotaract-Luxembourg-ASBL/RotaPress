import type { ReactNode } from "react";
import type { PublicPage, PublicSite } from "@/features/cms/cms_schemas";
import type { PublicOrganization } from "@/core/organization/organization_schemas";
import { RenderContent } from "@/features/cms/ui/public-content";
import { PublicSiteShell } from "./public-site-shell";
import type { PageCard } from "@/features/cms/page_collection";
import type { PublicEventCard } from "@/features/events/event_catalogue";
import type { EventFields } from "@/features/events/event_schemas";
import { eventPageNavigation } from "@/features/events/event_sections";
import {
  eventDesignStyle,
  visibleEventContent,
} from "@/features/events/event_design";

export function CmsPublicPage({
  page,
  site,
  club,
  preview = false,
  previewLabel = "Private draft preview. These changes are not published.",
  beforeContent,
  showTitle = true,
  previewCards,
  previewEvents,
  eventId,
  eventShareUrl,
  eventDetails,
}: {
  page: PublicPage;
  site: PublicSite;
  club: PublicOrganization | null;
  preview?: boolean;
  previewLabel?: string;
  beforeContent?: ReactNode;
  showTitle?: boolean;
  previewCards?: PageCard[];
  previewEvents?: PublicEventCard[];
  eventId?: string;
  eventShareUrl?: string;
  eventDetails?: EventFields;
}) {
  const eventDesign = eventId ? page.data.root.props.eventDesign : undefined;
  const data = eventId ? visibleEventContent(page.data) : page.data;
  const standalone =
    Boolean(eventId) &&
    (Boolean(eventDesign) || page.data.root.props.eventLayout === "standalone");
  return (
    <PublicSiteShell
      site={site}
      club={club}
      locale={page.locale}
      preview={preview}
      standalone={standalone}
      className={
        eventDesign?.presentation === "reference" ? "event-reference-page" : ""
      }
      eventAppearance={
        eventDesign
          ? {
              style: eventDesignStyle(eventDesign),
              palette: eventDesign.palette,
            }
          : undefined
      }
      beforeHeader={
        page.data.root.props.demonstration && (
          <div className="kit-demo-banner">
            Example club website · Fictional projects and illustrative
            photography · No actual club achievements
          </div>
        )
      }
    >
      {preview && previewLabel && (
        <div className="content-width notice notice-info">{previewLabel}</div>
      )}
      <main
        id="main-content"
        className="cms-content content-width"
        lang={page.locale}
      >
        {beforeContent}
        {eventDesign?.navigation && eventPageNavigation(data).length > 0 && (
          <nav
            className="event-section-navigation"
            aria-label="On this event page"
          >
            {eventPageNavigation(data).map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
        )}
        {showTitle &&
          !data.content.some(
            (item) =>
              item.type === "Hero" ||
              item.type === "EventHero" ||
              item.type === "HeroSlider" ||
              item.type === "PageIntro",
          ) && <h1 className="cms-page-title">{page.title}</h1>}
        <RenderContent
          locale={page.locale}
          data={data}
          sections={page.sections}
          partners={page.partners}
          preview={preview}
          previewCards={preview ? previewCards : undefined}
          previewEvents={preview ? previewEvents : undefined}
          eventId={eventId}
          eventDetails={eventDetails}
          eventShareUrl={preview ? undefined : eventShareUrl}
        />
      </main>
    </PublicSiteShell>
  );
}
