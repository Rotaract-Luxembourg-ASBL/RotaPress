import Link from "next/link";
import type { CmsLocale } from "../../cms/cms_schemas";
import { CmsImage } from "../../cms/ui/block-renderers";
import {
  selectPublishedEvents,
  type PublicEventCard,
} from "../event_catalogue";
import type { EventDirectoryDesign } from "../event_directory";
import { EventCards } from "./event-cards";

/** Shared public and draft-preview rendering; records arrive as public projections. */
export function EventDirectoryView({
  design,
  events,
  locale,
  period = design.defaultPeriod,
  preview = false,
  onPeriod,
}: {
  design: EventDirectoryDesign;
  events: PublicEventCard[];
  locale: CmsLocale;
  period?: "upcoming" | "past" | "all" | "featured";
  preview?: boolean;
  onPeriod?: (period: "upcoming" | "past" | "all") => void;
}) {
  const items = selectPublishedEvents(events, period);
  return (
    <section
      className="event-directory-design"
      aria-label="Published events"
      data-tone={design.tone}
      data-alignment={design.alignment}
    >
      <header className="event-directory-hero">
        {design.coverImageId && (
          <CmsImage
            id={design.coverImageId}
            alt=""
            className="event-directory-cover"
          />
        )}
        <div className="event-directory-introduction">
          {design.eyebrow && <p className="cms-eyebrow">{design.eyebrow}</p>}
          <h1>{design.title}</h1>
          <p>{design.introduction}</p>
        </div>
      </header>
      {design.showFilters && (
        <nav className="event-directory-filters" aria-label="Event period">
          {(
            [
              ["upcoming", "Upcoming & ongoing"],
              ["past", "Past events"],
              ["all", "All events"],
            ] as const
          ).map(([value, label]) =>
            preview ? (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => onPeriod?.(value)}
              >
                {label}
              </button>
            ) : (
              <Link
                key={value}
                href={`/events?locale=${locale}&period=${value}`}
                aria-current={period === value ? "page" : undefined}
              >
                {label}
              </Link>
            ),
          )}
        </nav>
      )}
      <div className="event-directory-results">
        {items.length ? (
          <EventCards
            items={items}
            locale={locale}
            layout={design.layout}
            display={design}
            preview={preview}
          />
        ) : (
          <p className="cms-events-empty">{design.emptyMessage}</p>
        )}
      </div>
    </section>
  );
}
