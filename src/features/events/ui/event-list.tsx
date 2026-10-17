"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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
import type { EventCollection } from "../event_collection";
import { useCollectionLocation } from "@/ui/collection-location";
import { CollectionPagination } from "@/ui/collection-pagination";
import { EventArchiveAction } from "./event-archive-action";
import { EventActionsMenu } from "./event-actions-menu";
import { EventCreateDialog } from "./event-create-dialog";

export function EventList({ navigation }: { navigation?: ReactNode }) {
  const { capabilities } = useCurrentUser();
  const { params, page, change } = useCollectionLocation();
  const query = params.get("search") ?? "";
  const view = params.get("status") ?? "active";
  const timing = params.get("timing") ?? "all";
  const sort = params.get("sort") ?? "newest";
  const returnTo = encodeURIComponent(`/admin/events?${params}`);
  const setView = (status: string) => change({ status });
  const setTiming = (value: string) => change({ timing: value });
  const { data, error, refresh } = useResource<EventCollection>(
    `/api/admin/events?${new URLSearchParams({ page: String(page), search: query, status: view, timing, sort })}`,
  );
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const events = data?.events ?? [];
  function clear() {
    change({
      search: undefined,
      status: "active",
      timing: "all",
      sort: "newest",
    });
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
              value: data.counts.active,
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
              value: data.counts.upcoming,
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
              value: data.counts.published,
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
              value: data.counts.draft,
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
                  count: data?.counts.active,
                },
                {
                  value: "published",
                  label: "Details published",
                  count: data?.counts.published,
                },
                {
                  value: "draft",
                  label: "Drafts",
                  count: data?.counts.draft,
                },
                {
                  value: "cancelled",
                  label: "Cancelled",
                  count: data?.counts.cancelled,
                },
                {
                  value: "archived",
                  label: "Archived",
                  count: data?.counts.archived,
                },
              ]}
            />
            <CollectionToolbar
              searchLabel="Search events"
              query={query}
              onQuery={(search) => change({ search })}
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
              <select
                aria-label="Sort events"
                value={sort}
                onChange={(event) => change({ sort: event.target.value })}
              >
                <option value="newest">Newest first</option>
                <option value="starts">Start date</option>
                <option value="title">Title</option>
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
          data && (
            <CollectionPagination
              {...data}
              noun="events"
              onPage={(next) => change({ page: next }, false)}
            />
          )
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
                    <Link
                      href={`/admin/events/${event.id}?returnTo=${returnTo}`}
                    >
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
                          href={`/admin/events/${event.id}?tab=website&returnTo=${returnTo}`}
                        >
                          Design page
                        </Link>
                      )}
                      <Link
                        className="button button-outline"
                        href={`/admin/events/${event.id}?returnTo=${returnTo}`}
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
                  data.counts.all
                    ? "No events match these filters"
                    : "Plan your first event"
                }
                description={
                  data.counts.all
                    ? "Try another search, date range or status. Archived events retain their content and records."
                    : "Start with the details, choose a layout, then publish when you are ready."
                }
              >
                {data.counts.all ? (
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
      {creating && <EventCreateDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
