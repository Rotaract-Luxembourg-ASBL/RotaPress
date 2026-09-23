"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CmsSummary } from "@/features/cms/cms_schemas";
import type { FormDto } from "@/features/forms/form_types";
import type { InboxPage } from "@/features/forms/inbox_schemas";
import type { EventSummary } from "@/features/events/event_schemas";
import type { CalendarWorkspace } from "@/features/calendar/calendar_schemas";
import { type Member, useResource } from "./api";
import { Icon, type IconName } from "./icon";
import { Arrow, Loading, Notice } from "./primitives";

function WorkspaceSummary({
  title,
  icon,
  href,
  description,
  error,
  loading,
  retry,
  children,
}: {
  title: string;
  icon: IconName;
  href: string;
  description: string;
  error?: string;
  loading: boolean;
  retry: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className="panel dashboard-workspace"
      aria-label={`${title} overview`}
    >
      <header>
        <span className="admin-collection-icon">
          <Icon name={icon} />
        </span>
        <h2>{title}</h2>
      </header>
      {error ? (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={retry}>
            Try again
          </button>
        </Notice>
      ) : loading ? (
        <Loading />
      ) : (
        children
      )}
      <p>{description}</p>
      <Link className="text-link" href={href}>
        Open {title.toLowerCase()} <Arrow />
      </Link>
    </section>
  );
}

function Metrics({ items }: { items: { label: string; value: number }[] }) {
  return (
    <dl className="dashboard-metrics">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WebsiteOverview() {
  const { data, error, refresh } = useResource<{ items: CmsSummary[] }>(
    "/api/admin/cms/content",
  );
  const pages =
    data?.items.filter((item) => item.kind === "page" && !item.archived) ?? [];
  const pending = pages.filter(
    (item) => item.publishedRevisionId !== item.draftRevisionId,
  );
  return (
    <WorkspaceSummary
      title="Website"
      icon="website"
      href="/admin/website?tab=pages"
      error={error}
      loading={!data}
      retry={refresh}
      description="Counts include each page language version. Drafts and saved edits stay private until published."
    >
      <Metrics
        items={[
          {
            label: "Published pages",
            value: pages.filter((item) => item.publishedRevisionId).length,
          },
          { label: "Drafts & changes", value: pending.length },
        ]}
      />
      {pending.length > 0 && (
        <ul className="dashboard-next-items">
          {pending.slice(0, 2).map((item) => (
            <li key={`${item.id}:${item.locale}`}>
              <Link href={`/admin/website/${item.id}?locale=${item.locale}`}>
                {item.title} <span>{item.locale.toUpperCase()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceSummary>
  );
}

export function FormsOverview() {
  const { data, error, refresh } = useResource<{ forms: FormDto[] }>(
    "/api/admin/forms",
  );
  const active = data?.forms.filter((item) => !item.archived) ?? [];
  return (
    <WorkspaceSummary
      title="Forms"
      icon="forms"
      href="/admin/forms"
      error={error}
      loading={!data}
      retry={refresh}
      description="Build questions and rules, publish a form and share it on your website."
    >
      <Metrics
        items={[
          {
            label: "Published",
            value: active.filter((item) => item.publishedVersionId).length,
          },
          {
            label: "Drafts",
            value: active.filter((item) => !item.publishedVersionId).length,
          },
        ]}
      />
    </WorkspaceSummary>
  );
}

export function EventsOverview() {
  const { data, error, refresh } = useResource<{ events: EventSummary[] }>(
    "/api/admin/events",
  );
  const active = data?.events.filter((item) => !item.archived) ?? [];
  return (
    <WorkspaceSummary
      title="Events"
      icon="calendar"
      href="/admin/events"
      error={error}
      loading={!data}
      retry={refresh}
      description="Only events you can access are counted. Each event manages its own page and participation."
    >
      <Metrics
        items={[
          { label: "Active events", value: active.length },
          {
            label: "Unpublished drafts",
            value: active.filter((item) => !item.cancelled && !item.published)
              .length,
          },
        ]}
      />
    </WorkspaceSummary>
  );
}

export function CalendarOverview() {
  const { data, error, refresh } = useResource<CalendarWorkspace>(
    "/api/admin/calendar",
  );
  return (
    <WorkspaceSummary
      title="Calendar"
      icon="calendar"
      href="/admin/calendar"
      error={error}
      loading={!data}
      retry={refresh}
      description="Group activities by audience. A repeating schedule counts as one activity."
    >
      <Metrics
        items={[
          {
            label: "Active calendars",
            value: data?.calendars.filter((item) => !item.archived).length ?? 0,
          },
          {
            label: "Activity drafts",
            value:
              data?.schedules.filter(
                (item) => !item.archived && !item.published,
              ).length ?? 0,
          },
        ]}
      />
    </WorkspaceSummary>
  );
}

export function MembersOverview() {
  const { data, error, refresh } = useResource<{ members: Member[] }>(
    "/api/admin/members",
  );
  return (
    <WorkspaceSummary
      title="Members"
      icon="members"
      href="/admin/members"
      error={error}
      loading={!data}
      retry={refresh}
      description="Review applications and give approved members the appropriate access."
    >
      <Metrics
        items={[
          {
            label: "Approved",
            value:
              data?.members.filter((item) => item.status === "approved")
                .length ?? 0,
          },
          {
            label: "Awaiting review",
            value:
              data?.members.filter((item) => item.status === "pending")
                .length ?? 0,
          },
        ]}
      />
    </WorkspaceSummary>
  );
}

export function ResponsesOverview() {
  const { data, error, refresh } = useResource<InboxPage>("/api/admin/inbox");
  return (
    <WorkspaceSummary
      title="Response center"
      icon="mail"
      href="/admin/inbox"
      error={error}
      loading={!data}
      retry={refresh}
      description="Website and event responses, scoped to the forms you are allowed to review."
    >
      <Metrics
        items={[
          { label: "New responses", value: data?.counts.new ?? 0 },
          { label: "In progress", value: data?.counts.reviewing ?? 0 },
        ]}
      />
    </WorkspaceSummary>
  );
}
