"use client";

import type { PageCollection } from "@/features/cms/cms_workspace_schemas";
import type { FormCollection } from "@/features/forms/form_collection";
import type { InboxPage } from "@/features/forms/inbox_schemas";
import type { EventCollection } from "@/features/events/event_collection";
import type { CalendarWorkspace } from "@/features/calendar/calendar_schemas";
import type { CalendarActivityCollection } from "@/features/calendar/calendar_collection";
import { type Member, useResource } from "./api";
import { useCurrentUser } from "./admin-shell";

/** Reuses the authorized workspaces; this is not a separate analytics source. */
export function useOverviewData() {
  const { capabilities, features } = useCurrentUser();
  const can = (capability: string) => capabilities.includes(capability);
  const access = {
    responses:
      features.forms &&
      (can("submissions.read") || can("events.responses.access")),
    members: can("members.review") || can("members.manage"),
    website: can("cms.edit"),
    forms: features.forms && can("forms.edit"),
    events: features.events && can("events.access"),
    calendar: features.calendar && can("calendar.manage"),
  };
  const responses = useResource<InboxPage>(
    access.responses ? "/api/admin/inbox" : null,
  );
  const members = useResource<{
    members: Member[];
    counts: { approved: number; pending: number; all: number };
  }>(access.members ? "/api/admin/members" : null);
  const website = useResource<PageCollection>(
    access.website ? "/api/admin/cms/pages?locale=en&collection=all" : null,
  );
  const forms = useResource<FormCollection>(
    access.forms ? "/api/admin/forms" : null,
  );
  const events = useResource<EventCollection>(
    access.events
      ? "/api/admin/events?status=active&timing=upcoming&sort=starts&pageSize=4"
      : null,
  );
  const calendar = useResource<CalendarWorkspace>(
    access.calendar ? "/api/admin/calendar?summary=true" : null,
  );
  const activities = useResource<CalendarActivityCollection>(
    access.calendar ? "/api/admin/calendar/schedules?pageSize=1" : null,
  );
  const pages =
    (access.website ? website.data?.items : undefined)?.filter(
      (item) => item.kind === "page" && !item.archived,
    ) ?? [];
  const pageDrafts = pages.filter(
    (item) => item.publishedRevisionId !== item.draftRevisionId,
  );
  const activeForms =
    (access.forms ? forms.data?.forms : undefined)?.filter(
      (item) => !item.archived,
    ) ?? [];
  const formDrafts = activeForms.filter(
    (item) =>
      item.publishedVersionNumber !== item.draftRevision &&
      (!item.event || item.event.canEdit),
  );
  const upcoming = (access.events ? events.data?.events : undefined) ?? [];
  return {
    access,
    responses,
    members,
    website,
    forms,
    events,
    calendar,
    activities,
    pageDrafts,
    formDrafts,
    upcoming,
  };
}

export type OverviewData = ReturnType<typeof useOverviewData>;
export type OverviewSource = {
  data?: unknown;
  error?: string;
  refresh: () => void;
};
