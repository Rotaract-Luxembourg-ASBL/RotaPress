"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { Arrow } from "./primitives";
import { StatusBadge } from "./collection";
import type { OverviewData, OverviewSource } from "./overview-data";

function SourceState({
  source,
  children,
}: {
  source: OverviewSource;
  children: ReactNode;
}) {
  if (source.error)
    return (
      <div className="dashboard-source-error" role="alert">
        <span>{source.error}</span>
        <button
          type="button"
          className="inline-button"
          onClick={source.refresh}
        >
          Try again
        </button>
      </div>
    );
  if (!source.data)
    return (
      <p className="dashboard-loading" role="status">
        Loading…
      </p>
    );
  return children;
}

export function OverviewMetrics({ data }: { data: OverviewData }) {
  const metrics = [
    {
      show: data.access.responses,
      title: "Response center",
      label: "New responses",
      value: data.responses.data?.counts.new,
      hint: "Across your permitted forms",
      icon: "mail" as const,
      href: "/admin/inbox?status=new",
      source: data.responses,
    },
    {
      show: data.access.members,
      title: "Members",
      label: "Approved members",
      value: data.members.data?.members.filter(
        (item) => item.status === "approved",
      ).length,
      hint: "In the current member list",
      icon: "members" as const,
      href: "/admin/members",
      source: data.members,
    },
    {
      show: data.access.website,
      title: "Website",
      label: "Published pages",
      value: data.pages.filter((item) => item.publishedRevisionId).length,
      hint: "Includes each language version",
      icon: "website" as const,
      href: "/admin/website?tab=pages",
      source: data.website,
    },
    {
      show: data.access.events,
      title: "Events",
      label: "Upcoming events",
      value: data.upcoming.length,
      hint: "Current and future · includes drafts",
      icon: "calendar" as const,
      href: "/admin/events",
      source: data.events,
    },
  ].filter((item) => item.show);
  if (!metrics.length) return null;
  return (
    <div className="dashboard-metrics" aria-label="Club at a glance">
      {metrics.map((item) => (
        <section
          className="dashboard-metric"
          key={item.title}
          aria-label={`${item.title} overview`}
        >
          <SourceState source={item.source}>
            <Link href={item.href}>
              <span className="dashboard-metric-label">
                <Icon name={item.icon} />
                {item.label}
                <Arrow />
              </span>
              <strong>{item.value}</strong>
              <small>{item.hint}</small>
            </Link>
          </SourceState>
          {(item.source.error || !item.source.data) && (
            <span className="dashboard-metric-label">{item.label}</span>
          )}
        </section>
      ))}
    </div>
  );
}

function PanelHeading({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description?: string;
  href?: string;
  action?: string;
}) {
  return (
    <header className="dashboard-panel-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {action}
          <Arrow />
        </Link>
      )}
    </header>
  );
}

export function OverviewAttention({ data }: { data: OverviewData }) {
  const tasks: {
    show: boolean;
    title: string;
    hint: string;
    count: number;
    href: string;
    icon: IconName;
    source: OverviewSource;
  }[] = [
    {
      show: data.access.responses,
      title: "Review new responses",
      hint: "Read and follow up in Response center",
      count: data.responses.data?.counts.new ?? 0,
      href: "/admin/inbox?status=new",
      icon: "mail",
      source: data.responses,
    },
    {
      show: data.access.members,
      title: "Review membership applications",
      hint: "Approval is a separate decision",
      count: data.pendingMembers.length,
      href: "/admin/members?status=pending",
      icon: "members",
      source: data.members,
    },
    {
      show: data.access.website,
      title: "Review website drafts",
      hint: "New pages and saved edits, by language",
      count: data.pageDrafts.length,
      href: "/admin/website?tab=pages",
      icon: "website",
      source: data.website,
    },
    {
      show: data.access.forms,
      title: "Finish form drafts",
      hint: "New forms and changes awaiting publication",
      count: data.formDrafts.length,
      href: "/admin/forms",
      icon: "forms",
      source: data.forms,
    },
    {
      show: data.access.events,
      title: "Review event drafts",
      hint: "Unpublished details in your event workspaces",
      count: data.activeEvents.filter((item) => !item.published).length,
      href: "/admin/events",
      icon: "calendar",
      source: data.events,
    },
    {
      show: data.access.calendar,
      title: "Finish activity drafts",
      hint: "Each saved schedule counts once",
      count:
        data.calendar.data?.schedules.filter(
          (item) =>
            !item.archived &&
            !item.published &&
            data.calendar.data?.calendars.some(
              (calendar) =>
                calendar.id === item.calendarId && !calendar.archived,
            ),
        ).length ?? 0,
      href: "/admin/calendar",
      icon: "calendar",
      source: data.calendar,
    },
  ];
  const allowedTasks = tasks.filter((item) => item.show);
  const visible = allowedTasks.filter(
    (item) => item.source.error || !item.source.data || item.count > 0,
  );
  if (!allowedTasks.length) return null;
  return (
    <section className="dashboard-panel" aria-label="Needs attention">
      <PanelHeading
        title="Needs attention"
        description="Choose a task to review or finish."
      />
      {visible.length ? (
        <ul className="dashboard-task-list">
          {visible.map((item) => (
            <li key={item.title}>
              <SourceState source={item.source}>
                <Link href={item.href}>
                  <span className="dashboard-item-icon">
                    <Icon name={item.icon} />
                  </span>
                  <span className="dashboard-item-copy">
                    <strong>{item.title}</strong>
                    <small>{item.hint}</small>
                  </span>
                  <span className="dashboard-task-count">{item.count}</span>
                  <Arrow />
                </Link>
              </SourceState>
              {(item.source.error || !item.source.data) && (
                <small>{item.title}</small>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="dashboard-empty">
          <Icon name="check" />
          <p>No outstanding reviews or drafts in the loaded workspace lists.</p>
        </div>
      )}
      <p className="dashboard-footnote">
        Counts follow your accessible workspace lists. Response totals include
        all matching pages.
      </p>
    </section>
  );
}

export function OverviewDrafts({ data }: { data: OverviewData }) {
  if (!data.access.website && !data.access.forms) return null;
  const drafts = [
    ...(!data.website.error
      ? data.pageDrafts.map((item) => ({
          key: `${item.id}:${item.locale}`,
          title: item.title,
          kind: `Page · ${item.locale.toUpperCase()}`,
          href: `/admin/website/${item.id}?locale=${item.locale}`,
          updatedAt: item.updatedAt,
          published: Boolean(item.publishedRevisionId),
          icon: "website" as const,
        }))
      : []),
    ...(!data.forms.error
      ? data.formDrafts
          .filter((item) => !item.event || item.event.canEdit)
          .map((item) => ({
            key: item.id,
            title: item.draft.title,
            kind: "Form",
            href: `/admin/forms/${item.id}`,
            updatedAt: item.updatedAt,
            published: Boolean(item.publishedVersionId),
            icon: "forms" as const,
          }))
      : []),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const ready =
    (!data.access.website || data.website.data) &&
    (!data.access.forms || data.forms.data);
  const failed =
    (data.access.website && data.website.error) ||
    (data.access.forms && data.forms.error);
  return (
    <section className="dashboard-panel" aria-label="Continue editing">
      <PanelHeading
        title="Continue editing"
        description="Your most recently saved page and form drafts."
      />
      {drafts.length > 0 && (
        <ul className="dashboard-draft-list">
          {drafts.map((item) => (
            <li key={item.key}>
              <Link href={item.href}>
                <span className="dashboard-item-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="dashboard-item-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {item.kind} · Saved {shortDate(item.updatedAt)}
                  </small>
                </span>
                <StatusBadge tone="warning">
                  {item.published ? "Unpublished changes" : "Draft"}
                </StatusBadge>
                <Arrow />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!ready && !failed && (
        <p className="dashboard-loading" role="status">
          Loading saved drafts…
        </p>
      )}
      {failed && (
        <p className="dashboard-footnote">
          Some drafts could not be loaded. Use Try again in Needs attention.
        </p>
      )}
      {ready && !failed && drafts.length === 0 && (
        <p className="dashboard-empty">
          No saved drafts to continue. Open Website or Forms to start something
          new.
        </p>
      )}
      <footer className="dashboard-panel-links">
        {data.access.website && (
          <Link href="/admin/website?tab=pages">
            All pages <Arrow />
          </Link>
        )}
        {data.access.forms && (
          <Link href="/admin/forms">
            All forms <Arrow />
          </Link>
        )}
      </footer>
    </section>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function OverviewSchedule({ data }: { data: OverviewData }) {
  if (!data.access.events && !data.access.calendar) return null;
  return (
    <section className="dashboard-panel" aria-label="Coming up">
      <PanelHeading
        title="Coming up"
        description={
          data.access.events
            ? "Current and upcoming events you can access."
            : "Manage your scheduled activities."
        }
        href={data.access.events ? "/admin/events" : "/admin/calendar"}
        action={data.access.events ? "All events" : "Open calendar"}
      />
      {data.access.events && (
        <SourceState source={data.events}>
          {data.upcoming.length ? (
            <ul className="dashboard-event-list">
              {data.upcoming.slice(0, 4).map((event) => (
                <li key={event.id}>
                  <Link href={`/admin/events/${event.id}`}>
                    <time
                      className="dashboard-event-date"
                      dateTime={event.startsAt}
                    >
                      <strong>
                        {new Intl.DateTimeFormat("en-GB", {
                          day: "numeric",
                          timeZone: event.timezone,
                        }).format(new Date(event.startsAt))}
                      </strong>
                      <span>
                        {new Intl.DateTimeFormat("en-GB", {
                          month: "short",
                          timeZone: event.timezone,
                        }).format(new Date(event.startsAt))}
                      </span>
                    </time>
                    <span className="dashboard-item-copy">
                      <strong>{event.title}</strong>
                      <small>
                        {new Intl.DateTimeFormat("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZoneName: "short",
                          timeZone: event.timezone,
                        }).format(new Date(event.startsAt))}
                        {event.venue ? ` · ${event.venue}` : ""}
                      </small>
                      <span className="dashboard-event-status">
                        {event.published
                          ? "Details published"
                          : "Private draft"}
                      </span>
                    </span>
                    <Arrow />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">
              No upcoming events. Open Events to plan your next activity.
            </p>
          )}
        </SourceState>
      )}
      {data.access.calendar && (
        <section
          className="dashboard-calendar-link"
          aria-label="Calendar overview"
        >
          <SourceState source={data.calendar}>
            <Link href="/admin/calendar">
              <Icon name="calendar" />
              <span>
                <strong>Calendar activities</strong>
                <small>
                  {
                    data.calendar.data?.calendars.filter(
                      (item) => !item.archived,
                    ).length
                  }{" "}
                  active calendars · Open schedules and repeating activities
                </small>
              </span>
              <Arrow />
            </Link>
          </SourceState>
        </section>
      )}
    </section>
  );
}

export function OverviewForms({ data }: { data: OverviewData }) {
  if (!data.access.forms) return null;
  return (
    <section
      className="dashboard-panel dashboard-form-summary"
      aria-label="Forms overview"
    >
      <PanelHeading title="Forms" href="/admin/forms" action="Open forms" />
      <SourceState source={data.forms}>
        <dl>
          <div>
            <dt>Published</dt>
            <dd>
              {
                data.activeForms.filter((item) => item.publishedVersionId)
                  .length
              }
            </dd>
          </div>
          <div>
            <dt>Drafts & changes</dt>
            <dd>{data.formDrafts.length}</dd>
          </div>
        </dl>
        <p className="dashboard-footnote">
          Published forms can still have private edits.
        </p>
      </SourceState>
    </section>
  );
}
