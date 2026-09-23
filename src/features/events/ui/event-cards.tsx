import type { CmsLocale } from "../../cms/cms_schemas";
import { CmsImage } from "../../cms/ui/block-renderers";
import type { PublicEventCard } from "../event_catalogue";

export function EventCards({
  items,
  locale,
  layout = "cards",
  display,
  preview = false,
}: {
  items: PublicEventCard[];
  locale: CmsLocale;
  layout?: "cards" | "list";
  display?: {
    showImages: boolean;
    showDescriptions: boolean;
    showVenues: boolean;
    buttonLabel: string;
  };
  preview?: boolean;
}) {
  if (!items.length)
    return (
      <p className="cms-events-empty">
        No published events for this period in this language.
      </p>
    );
  return (
    <div
      className={`cms-event-cards cms-event-layout-${layout}${layout === "cards" ? " cms-card-grid" : ""}`}
    >
      {items.map((event) => (
        <article className="cms-card cms-event-card" key={event.id}>
          {event.imageId && display?.showImages !== false && (
            <CmsImage id={event.imageId} alt="" className="cms-event-cover" />
          )}
          <div className="cms-event-card-copy">
            <time className="cms-eyebrow" dateTime={event.startsAt}>
              {new Date(event.startsAt).toLocaleDateString(locale, {
                timeZone: event.timezone,
                dateStyle: "long",
              })}
            </time>
            <h3>
              {preview ? event.title : <a href={event.href}>{event.title}</a>}
            </h3>
            {event.cancelled && <p className="cms-option-badge">Cancelled</p>}
            {event.venue && display?.showVenues !== false && (
              <p className="cms-event-venue">{event.venue}</p>
            )}
            {event.description && display?.showDescriptions !== false && (
              <p className="cms-event-excerpt">{event.description}</p>
            )}
            {preview ? (
              <span className="text-link">
                {display?.buttonLabel ?? "Event details"} →
              </span>
            ) : (
              <a href={event.href} className="text-link">
                {display?.buttonLabel ?? "Event details"} →
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
