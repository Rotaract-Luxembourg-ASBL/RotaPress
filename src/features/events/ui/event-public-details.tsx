import Link from "next/link";
import type { CmsData } from "@/features/cms/cms_schemas";
import type { EventFields } from "../event_schemas";
import { eventModules, type EventModuleKey } from "../event_modules";
import { visibleEventContent } from "../event_design";
export function EventPublicDetails({
  event,
  locale,
  navigation = [],
  current,
  cancelled = false,
  pageData,
}: {
  event: EventFields;
  locale: string;
  navigation?: { key: EventModuleKey; href: string }[];
  current?: string;
  cancelled?: boolean;
  pageData?: CmsData;
}) {
  // The reference introduction owns the visible event identity and date. Keep
  // cancellation and links to separate event pages available outside that hero.
  const integrated =
    pageData &&
    visibleEventContent(pageData).content.some(
      (block) => block.type === "EventHero",
    );
  if (integrated)
    return (
      <>
        {cancelled && (
          <p className="notice notice-info">
            <strong>This event is cancelled.</strong> Registration and event
            forms on this website are closed.
          </p>
        )}
        {navigation.length > 1 && (
          <nav
            className="event-module-navigation"
            aria-label="Event navigation"
          >
            {navigation.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === current ? "page" : undefined}
              >
                {eventModules[item.key].label}
              </Link>
            ))}
          </nav>
        )}
      </>
    );
  const compact = Boolean(
    pageData?.root.props.eventDesign &&
    visibleEventContent(pageData).content.some(
      (block) =>
        block.type === "Hero" ||
        block.type === "HeroSlider" ||
        block.type === "PageIntro",
    ),
  );
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;
  const sameDay =
    end &&
    start.toLocaleDateString(locale, { timeZone: event.timezone }) ===
      end.toLocaleDateString(locale, { timeZone: event.timezone });
  return (
    <section className="cms-event-summary" aria-label="Event details">
      {cancelled && (
        <p className="notice notice-info">
          <strong>This event is cancelled.</strong> Registration and event forms
          on this website are closed.
        </p>
      )}
      {!compact && <p>{event.title}</p>}
      <p>
        <time dateTime={event.startsAt}>
          {start.toLocaleString(locale, {
            timeZone: event.timezone,
            dateStyle: "long",
            timeStyle: "short",
          })}
        </time>
        {end && (
          <>
            {" – "}
            <time dateTime={event.endsAt!}>
              {end.toLocaleString(locale, {
                timeZone: event.timezone,
                dateStyle: sameDay ? undefined : "long",
                timeStyle: "short",
              })}
            </time>
          </>
        )}{" "}
        · {event.timezone}
        {event.venue && ` · ${event.venue}`}
      </p>
      {!compact && event.description && <p>{event.description}</p>}
      {navigation.length > 1 && (
        <nav aria-label="Event navigation">
          {navigation.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === current ? "page" : undefined}
            >
              {eventModules[item.key].label}
            </Link>
          ))}
        </nav>
      )}
    </section>
  );
}
