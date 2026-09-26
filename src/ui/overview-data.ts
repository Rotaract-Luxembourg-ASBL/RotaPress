"use client";

import { useState } from "react";
import type { CmsSummary } from "@/features/cms/cms_schemas";
import type { FormDto } from "@/features/forms/form_types";
import type { InboxPage } from "@/features/forms/inbox_schemas";
import type { EventSummary } from "@/features/events/event_schemas";
import type { CalendarWorkspace } from "@/features/calendar/calendar_schemas";
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
  const members = useResource<{ members: Member[] }>(
    access.members ? "/api/admin/members" : null,
  );
  const website = useResource<{ items: CmsSummary[] }>(
    access.website ? "/api/admin/cms/content" : null,
  );
  const forms = useResource<{ forms: FormDto[] }>(
    access.forms ? "/api/admin/forms" : null,
  );
  const events = useResource<{ events: EventSummary[] }>(
    access.events ? "/api/admin/events" : null,
  );
  const calendar = useResource<CalendarWorkspace>(
    access.calendar ? "/api/admin/calendar" : null,
  );
  const [openedAt] = useState(() => Date.now());
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
  const activeEvents =
    (access.events ? events.data?.events : undefined)?.filter(
      (item) => !item.archived && !item.cancelled,
    ) ?? [];
  const upcoming = activeEvents
    .filter(
      (item) => new Date(item.endsAt ?? item.startsAt).getTime() >= openedAt,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    access,
    responses,
    members,
    website,
    forms,
    events,
    calendar,
    pages,
    pageDrafts,
    activeForms,
    formDrafts,
    activeEvents,
    upcoming,
    pendingMembers:
      (access.members ? members.data?.members : undefined)?.filter(
        (item) => item.status === "pending",
      ) ?? [],
  };
}

export type OverviewData = ReturnType<typeof useOverviewData>;
export type OverviewSource = {
  data?: unknown;
  error?: string;
  refresh: () => void;
};
