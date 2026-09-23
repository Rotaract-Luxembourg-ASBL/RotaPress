"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { useResource } from "@/ui/api";
import { Icon } from "@/ui/icon";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import {
  Collection,
  CollectionEmpty,
  CollectionRow,
  CollectionToolbar,
  FilterTabs,
  StatusBadge,
  SummaryStats,
} from "@/ui/collection";
import type { EventSummary } from "../event_schemas";
import { EventArchiveAction } from "./event-archive-action";
import { EventActionsMenu } from "./event-actions-menu";
import { EventCreateDialog } from "./event-create-dialog";

export function EventList({ navigation }: { navigation?: ReactNode }) {
  const { capabilities } = useCurrentUser();
  const { data, error, refresh } = useResource<{ events: EventSummary[] }>(
    "/api/admin/events",
  );
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("active");
  const [timing, setTiming] = useState("all");
  const [message, setMessage] = useState("");
  const [asOf, setAsOf] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setAsOf(Date.now());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const all = data?.events ?? [];
  const active = all.filter((event) => !event.archived);
  const published = active.filter(
    (event) => !event.cancelled && event.published,
  );
  const drafts = active.filter((event) => !event.cancelled && !event.published);
  const cancelled = active.filter((event) => event.cancelled);
  const archived = all.filter((event) => event.archived);
  // This is the saved planning schedule, not a claim about public listing visibility.
  const upcoming = active.filter(
    (event) => !event.cancelled && new Date(event.startsAt).getTime() >= asOf,
  );
  const events = all.filter((event) => {
    const match =
      view === "archived"
        ? event.archived
        : !event.archived &&
          (view === "active" ||
            (view === "cancelled"
              ? event.cancelled
              : !event.cancelled &&
                (view === "published"
                  ? Boolean(event.published)
                  : !event.published)));
    const future = new Date(event.startsAt).getTime() >= asOf;
    return (
      match &&
      (timing === "all" ||
        (timing === "upcoming" ? future && !event.cancelled : !future)) &&
      event.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    );
  });
  function clear() {
    setQuery("");
    setView("active");
    setTiming("all");
  }
  return (
    <div className="event-directory">
      <PageHeading
        title="Events"
        description="Plan events, design their pages and manage participation in one workspace."
      >
        {capabilities.includes("events.create") && (
          <button
            className="button button-accent"
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" />
            New event
          </button>
        )}
      </PageHeading>
      {navigation}
      {message && <Notice kind="success">{message}</Notice>}
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {data && (
        <SummaryStats
          label="Event counts"
          items={[
            {
              label: "Active events",
              value: active.length,
              hint: "Excludes archived events",
              icon: "calendar",
              onClick: () => {
                setView("active");
                setTiming("all");
              },
              selected: view === "active" && timing === "all",
            },
            {
              label: "Upcoming",
              value: upcoming.length,
              hint: "Based on saved start dates",
              icon: "calendar",
              onClick: () => {
                setView("active");
                setTiming("upcoming");
              },
              selected: timing === "upcoming",
            },
            {
              label: "Details published",
              value: published.length,
              hint: "Page visibility is managed per event",
              icon: "check",
              onClick: () => {
                setView("published");
                setTiming("all");
              },
              selected: view === "published",
            },
            {
              label: "Drafts",
              value: drafts.length,
              hint: "Event details not published yet",
              icon: "edit",
              onClick: () => {
                setView("draft");
                setTiming("all");
              },
              selected: view === "draft",
            },
          ]}
        />
      )}
      <Collection
        label="Your events"
        noun="Event"
        detailLabel="Starts"
        toolbar={
          <>
            <FilterTabs
              label="Filter events by status"
              value={view}
              onChange={setView}
              options={[
                {
                  value: "active",
                  label: "All active",
                  count: data ? active.length : undefined,
                },
                {
                  value: "published",
                  label: "Details published",
                  count: data ? published.length : undefined,
                },
                {
                  value: "draft",
                  label: "Drafts",
                  count: data ? drafts.length : undefined,
                },
                {
                  value: "cancelled",
                  label: "Cancelled",
                  count: data ? cancelled.length : undefined,
                },
                {
                  value: "archived",
                  label: "Archived",
                  count: data ? archived.length : undefined,
                },
              ]}
            />
            <CollectionToolbar
              searchLabel="Search events"
              query={query}
              onQuery={setQuery}
            >
              <select
                aria-label="Event dates"
                value={timing}
                onChange={(event) => setTiming(event.target.value)}
              >
                <option value="all">All dates</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
              {(query || timing !== "all") && (
                <button className="button button-outline" onClick={clear}>
                  Clear filters
                </button>
              )}
            </CollectionToolbar>
          </>
        }
        footer={
          data &&
          `${events.length} of ${all.length} events shown · Only events you can access are counted.`
        }
      >
        {!data && !error && <Loading />}
        {data && (
          <>
            <ul className="admin-collection-rows">
              {events.map((event) => (
                <CollectionRow
                  key={event.id}
                  icon={<Icon name="calendar" />}
                  title={
                    <Link href={`/admin/events/${event.id}`}>
                      {event.title}
                    </Link>
                  }
                  description={`Manager: ${event.manager?.name ?? "Unavailable"}`}
                  status={
                    <StatusBadge
                      tone={
                        event.archived
                          ? "neutral"
                          : event.cancelled
                            ? "danger"
                            : event.published
                              ? "success"
                              : "warning"
                      }
                    >
                      {event.archived
                        ? "Archived"
                        : event.cancelled
                          ? "Cancelled"
                          : event.published
                            ? "Details published"
                            : "Draft"}
                    </StatusBadge>
                  }
                  detail={{
                    label: "Starts",
                    value: (
                      <>
                        <time dateTime={event.startsAt}>
                          {new Date(event.startsAt).toLocaleString("en-GB", {
                            timeZone: event.timezone,
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </time>
                        <br />
                        {event.timezone}
                      </>
                    ),
                  }}
                  actions={
                    <>
                      {!event.archived && !event.cancelled && (
                        <Link
                          className="text-link"
                          href={`/admin/events/${event.id}?tab=website`}
                        >
                          Design page
                        </Link>
                      )}
                      <Link
                        className="button button-outline"
                        href={`/admin/events/${event.id}`}
                      >
                        {event.archived ? "View event" : "Open event"}
                      </Link>
                      {!event.archived && event.canArchive && (
                        <EventActionsMenu label={`Actions for ${event.title}`}>
                          <EventArchiveAction
                            event={event}
                            onArchived={() => {
                              setMessage(
                                "Event archived. Its content and records are retained in Archived.",
                              );
                              refresh();
                            }}
                          />
                        </EventActionsMenu>
                      )}
                    </>
                  }
                />
              ))}
            </ul>
            {!events.length && (
              <CollectionEmpty
                icon="calendar"
                title={
                  all.length
                    ? "No events match these filters"
                    : "Plan your first event"
                }
                description={
                  all.length
                    ? "Try another search, date range or status. Archived events retain their content and records."
                    : "Start with the details, choose a layout, then publish when you are ready."
                }
              >
                {all.length ? (
                  <button className="button button-outline" onClick={clear}>
                    Clear filters
                  </button>
                ) : (
                  capabilities.includes("events.create") && (
                    <button
                      className="button button-accent"
                      onClick={() => setCreating(true)}
                    >
                      Create your first event
                    </button>
                  )
                )}
              </CollectionEmpty>
            )}
          </>
        )}
      </Collection>
      {creating && (
        <EventCreateDialog sources={all} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
