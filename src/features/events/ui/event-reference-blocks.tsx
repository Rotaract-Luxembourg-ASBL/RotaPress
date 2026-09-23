import type { BlockProps } from "@/features/cms/ui/block-renderers";
import { CmsImage, SafeLink } from "@/features/cms/ui/block-renderers";
import type { EventFields } from "../event_schemas";
import { EventCountdown, EventCalendarButton } from "./event-visitor-tools";

type EventContext = { event?: EventFields; locale?: string; preview?: boolean };
export function EventHeroBlock(props: BlockProps<"EventHero"> & EventContext) {
  const event = props.event;
  return (
    <section
      className="event-reference-hero"
      data-layout={props.layout}
      data-height={props.height}
    >
      {props.assetId && (
        <div className="event-reference-art">
          <CmsImage id={props.assetId} alt={props.imageAlt} />
        </div>
      )}
      <div
        className="event-reference-shade"
        style={{ opacity: props.overlay / 100 }}
      />
      <div className="event-reference-hero-copy">
        {props.badge && (
          <span className="event-reference-badge">{props.badge}</span>
        )}
        <h1>{event?.title ?? "Your event name"}</h1>
        {props.tagline && <h2>{props.tagline}</h2>}
        {event?.description && (
          <p className="event-reference-introduction">{event.description}</p>
        )}
        {event && (
          <div className="event-reference-meta">
            <time dateTime={event.startsAt}>
              {new Date(event.startsAt).toLocaleDateString(
                props.locale ?? "en",
                {
                  timeZone: event.timezone,
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                },
              )}
            </time>
            {event.venue && <span>{event.venue}</span>}
            <EventCalendarButton event={event} disabled={props.preview} />
          </div>
        )}
        {props.buttonLabel && props.buttonHref && (
          <SafeLink className="button button-accent" href={props.buttonHref}>
            {props.buttonLabel} <span aria-hidden="true">→</span>
          </SafeLink>
        )}
        {props.countdown && event && (
          <EventCountdown startsAt={event.startsAt} />
        )}
      </div>
    </section>
  );
}

export function EventPracticalBlock(
  props: BlockProps<"EventPractical"> & EventContext,
) {
  const event = props.event;
  return (
    <section className="cms-block event-reference-practical">
      <header className="cms-section-heading">
        <h2>{props.title}</h2>
      </header>
      <dl>
        {event && (
          <>
            <div>
              <dt>When</dt>
              <dd>
                <time dateTime={event.startsAt}>
                  {new Date(event.startsAt).toLocaleString(
                    props.locale ?? "en",
                    {
                      timeZone: event.timezone,
                      dateStyle: "long",
                      timeStyle: "short",
                    },
                  )}
                </time>
                {event.endsAt && (
                  <>
                    {" "}
                    –{" "}
                    {new Date(event.endsAt).toLocaleString(
                      props.locale ?? "en",
                      {
                        timeZone: event.timezone,
                        dateStyle: "medium",
                        timeStyle: "short",
                      },
                    )}
                  </>
                )}
                <small>{event.timezone}</small>
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                {event.venue || "Venue to be announced"}
                {props.address && <p>{props.address}</p>}
                {props.directions && (
                  <SafeLink href={props.directions}>Get directions ↗</SafeLink>
                )}
              </dd>
            </div>
          </>
        )}
        {props.items.map((item, index) => (
          <div key={index}>
            <dt>{item.label}</dt>
            <dd>{item.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function EventImpactBlock(props: BlockProps<"EventImpact">) {
  return (
    <section className="cms-block event-reference-impact">
      <header className="cms-section-heading">
        <h2>{props.title}</h2>
        {props.introduction && <p>{props.introduction}</p>}
      </header>
      <div className="event-impact-card">
        {props.items.length > 0 && (
          <dl>
            {props.items.map((item, index) => (
              <div key={index}>
                <dt>{item.label}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        )}
        <div>
          <h3>{props.heading}</h3>
          <p>{props.text}</p>
          {props.buttonLabel && props.buttonHref && (
            <SafeLink href={props.buttonHref} className="button button-accent">
              {props.buttonLabel}
            </SafeLink>
          )}
        </div>
      </div>
    </section>
  );
}

export function EventFooterBlock(
  props: BlockProps<"EventFooter"> &
    EventContext & { navigation?: { label: string; href: string }[] },
) {
  return (
    <footer className="event-reference-footer">
      <div className="event-footer-inner">
        <div className="event-footer-heading">
          <div>
            <p className="eyebrow">See you at the event</p>
            <h2>{props.heading}</h2>
          </div>
          <a href="#main-content">Back to top ↑</a>
        </div>
        <div className="event-footer-columns">
          <div>
            <h3>{props.event?.title ?? "Your event"}</h3>
            {props.text && <p>{props.text}</p>}
          </div>
          {props.showNavigation && props.navigation?.length ? (
            <nav aria-label="Explore the event">
              <h3>Explore the event</h3>
              {props.navigation.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null}
          {(props.email || props.links.length > 0) && (
            <div>
              <h3>Stay connected</h3>
              {props.email && (
                <a href={`mailto:${props.email}`}>{props.email}</a>
              )}
              {props.links.map((item, index) => (
                <SafeLink key={index} href={item.href}>
                  {item.label}
                </SafeLink>
              ))}
            </div>
          )}
        </div>
        <div className="event-footer-bottom">
          <span>{props.event?.title}</span>
          <span>Made with RotaPress</span>
        </div>
      </div>
    </footer>
  );
}
