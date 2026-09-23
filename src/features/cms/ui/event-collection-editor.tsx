"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import type { Config } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import type { CmsLocale } from "../cms_schemas";
import type { PublicEventCard } from "../../events/event_catalogue";
import { EventCards } from "../../events/ui/event-cards";
import { useResource } from "@/ui/api";
import { useCurrentUser } from "@/ui/admin-shell";
import { useRefreshOnFocus } from "./event-editor-scope";

export const EditorLocale = createContext<CmsLocale>("en");
function EventCollectionSource() {
  const { capabilities, features } = useCurrentUser();
  return (
    <div className="field-help">
      <p>
        {features.events
          ? "Events and their pages must be published before they appear here. Edit dates, booking options and event content in Events."
          : "Events is disabled in Integrations. This block keeps its settings."}
      </p>
      {features.events && capabilities.includes("events.manage") && (
        <Link className="text-link" href="/admin/events" target="_blank">
          Manage events ↗
        </Link>
      )}
    </div>
  );
}
function EventCollectionPreview(props: PuckBlocks["EventCollection"]) {
  const locale = useContext(EditorLocale);
  const { features, capabilities } = useCurrentUser();
  const { data, error, refresh } = useResource<{ items: PublicEventCard[] }>(
    features.events
      ? `/api/admin/events/catalogue?locale=${locale}&period=${props.period}&limit=${props.limit}`
      : null,
  );
  useRefreshOnFocus(refresh);
  return (
    <section className="cms-block cms-event-collection">
      <header className="cms-section-heading">
        <h2>{props.title}</h2>
        {props.introduction && <p>{props.introduction}</p>}
      </header>
      {!features.events ? (
        <p>
          Events is disabled in Integrations. This block and its settings are
          retained.
        </p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : data ? (
        <EventCards items={data.items} locale={locale} layout={props.layout} />
      ) : (
        <p>Loading published events…</p>
      )}
      <p className="field-help">
        Managed in Events. This section updates when a public event and its
        website are published in this language. Drafts and private events are
        excluded.
      </p>
      {features.events && capabilities.includes("events.manage") && (
        <Link className="text-link" href="/admin/events" target="_blank">
          Manage events ↗
        </Link>
      )}
    </section>
  );
}
export const eventCollectionConfig: Config<PuckBlocks>["components"]["EventCollection"] =
  {
    label: "Published events",
    fields: {
      version: {
        type: "custom",
        label: "Connected events",
        render: () => <EventCollectionSource />,
      },
      title: { type: "text", label: "Heading" },
      introduction: { type: "textarea", label: "Introduction" },
      period: {
        type: "select",
        label: "Show events",
        options: [
          { label: "Upcoming & ongoing", value: "upcoming" },
          { label: "Past", value: "past" },
          { label: "All", value: "all" },
          { label: "Featured homepage event", value: "featured" },
        ],
      },
      limit: { type: "number", label: "Maximum events", min: 1, max: 24 },
      layout: {
        type: "radio",
        label: "Layout",
        options: [
          { label: "Cards", value: "cards" },
          { label: "List", value: "list" },
        ],
      },
    },
    defaultProps: {
      version: 1,
      title: "Meet us at our next event",
      introduction: "",
      period: "upcoming",
      limit: 6,
      layout: "cards",
    },
    render: (props) => <EventCollectionPreview {...props} />,
  };
