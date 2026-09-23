import "server-only";
import { services } from "@/composition/services";
import type { CmsLocale } from "../cms_schemas";
import type { BlockProps } from "./block-renderers";
import { selectPublishedEvents } from "../../events/event_catalogue";
import { EventCards } from "../../events/ui/event-cards";

export async function PublicEventCollection(
  props: BlockProps<"EventCollection"> & { locale: CmsLocale },
) {
  if (!(await services.authorization.features.installed()).events) return null;
  const items = selectPublishedEvents(
    await services.eventWebsite.publicList(props.locale),
    props.period,
    props.limit,
  );
  if (!items.length) return null;
  return (
    <section className="cms-block cms-event-collection">
      <header className="cms-section-heading">
        <h2>{props.title}</h2>
        {props.introduction && <p>{props.introduction}</p>}
      </header>
      <EventCards items={items} locale={props.locale} layout={props.layout} />
      <p className="cms-events-more">
        <a className="text-link" href={`/events?locale=${props.locale}`}>
          Explore all events →
        </a>
      </p>
    </section>
  );
}
