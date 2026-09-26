import { expect, type APIRequestContext } from "@playwright/test";
import type {
  CalendarFeed,
  CalendarWorkspace,
} from "../../src/features/calendar/calendar_schemas";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

/** Exercise selected action grants through the actual OAuth-to-MCP transport. */
export async function oauthManagementJourney(
  api: APIRequestContext,
  accessToken: string,
  pageId: string,
) {
  const rpc = async (method: string, params: Record<string, unknown>) => {
    const response = await api.post("/api/mcp", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 64, method, params },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).result;
  };
  const call = async <T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> => {
    const result = await rpc("tools/call", { name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    return result.structuredContent.data as T;
  };
  const listing = (await rpc("tools/list", {})) as {
    tools: { name: string }[];
  };
  const names = listing.tools.map((tool) => tool.name);
  expect(names).toEqual(
    expect.arrayContaining([
      "calendar_create",
      "calendar_save",
      "calendar_archive",
      "calendar_restore",
      "calendar_schedule_create",
      "calendar_schedule_save",
      "calendar_schedule_archive",
      "calendar_schedule_restore",
      "calendar_page_save",
      "calendar_publish",
      "calendar_schedule_publish",
      "calendar_page_publish",
      "website_revision_get",
      "website_duplicate",
      "website_restore",
      "website_locale_create",
      "website_settings_save",
      "website_publish",
      "website_settings_publish",
    ]),
  );
  expect(names).not.toContain("website_save");
  expect(names).not.toContain("events_create");
  expect(await call("automation_capabilities", {})).toMatchObject({
    publication: "on-request",
  });
  type Changed = { id: string; version: number };
  const before = await call<CalendarWorkspace>("calendar_read", {});
  const definition = {
    name: "Synthetic OAuth calendar",
    description: "Draft managed through MCP",
    color: "#25636b",
    timezone: "Europe/Luxembourg",
    audience: "members",
    eventSource: "none",
    eventIds: [],
  };
  const calendar = await call<Changed>("calendar_create", { definition });
  await call("calendar_save", {
    id: calendar.id,
    expectedVersion: calendar.version,
    definition: { ...definition, name: "Updated OAuth calendar" },
  });
  const stale = await rpc("tools/call", {
    name: "calendar_save",
    arguments: {
      id: calendar.id,
      expectedVersion: calendar.version,
      definition,
    },
  });
  expect(stale.isError).toBe(true);
  expect(JSON.stringify(stale.content)).toContain("changed in another tab");
  const activity = {
    title: "Weekly planning",
    description: "Private activity",
    location: "Club room",
    url: "",
    date: "2026-10-19",
    time: "18:00",
    timezone: "Europe/Luxembourg",
    durationMinutes: 60,
    allDay: false,
    days: 1,
    repeat: "weekly",
    interval: 1,
    weekdays: [1],
    until: "2026-12-31",
    skippedDates: [],
    cancelled: false,
  };
  const schedule = await call<Changed>("calendar_schedule_create", {
    calendarId: calendar.id,
    definition: activity,
  });
  await call("calendar_schedule_save", {
    calendarId: calendar.id,
    id: schedule.id,
    expectedVersion: schedule.version,
    definition: { ...activity, skippedDates: ["2026-10-26"], cancelled: true },
  });
  for (const [name, expectedVersion] of [
    ["archive", 2],
    ["restore", 3],
  ] as const)
    await call(`calendar_schedule_${name}`, {
      calendarId: calendar.id,
      id: schedule.id,
      expectedVersion,
    });
  await call("calendar_page_save", {
    expectedVersion: before.page.version,
    definition: {
      ...before.page.draft,
      title: "OAuth calendar draft",
      view: "agenda",
      calendarIds: [calendar.id],
    },
  });
  const saved = await call<CalendarWorkspace>("calendar_read", {});
  const savedCalendar = saved.calendars.find(
    (item) => item.id === calendar.id,
  )!;
  const savedSchedule = saved.schedules.find(
    (item) => item.id === schedule.id,
  )!;
  expect(savedCalendar).toMatchObject({
    version: 2,
    archived: false,
    published: null,
    draft: { audience: "members" },
  });
  expect(savedSchedule).toMatchObject({
    version: 4,
    archived: false,
    published: null,
    draft: { cancelled: true, skippedDates: ["2026-10-26"] },
  });
  expect(saved.page).toMatchObject({
    version: before.page.version + 1,
    published: before.page.published,
    draft: { title: "OAuth calendar draft", view: "agenda" },
  });
  const page = await call<CmsDetail>("website_get", {
    id: pageId,
    locale: "en",
  });
  expect(page.publishedRevisionId).toBeNull();
  for (const [name, args] of [
    [
      "calendar_publish",
      { id: calendar.id, expectedVersion: savedCalendar.version },
    ],
    [
      "website_publish",
      {
        id: pageId,
        locale: "en",
        expectedRevisionId: page.draft.id,
        confirmed: false,
      },
    ],
  ] as const)
    expect((await rpc("tools/call", { name, arguments: args })).isError).toBe(
      true,
    );
  expect(
    (await call<CmsDetail>("website_get", { id: pageId, locale: "en" }))
      .publishedRevisionId,
  ).toBeNull();

  await call("calendar_publish", {
    id: calendar.id,
    expectedVersion: savedCalendar.version,
    confirmed: true,
  });
  const afterCalendar = await call<CalendarWorkspace>("calendar_read", {});
  expect(
    afterCalendar.schedules.find((item) => item.id === schedule.id)?.published,
  ).toBeNull();
  expect(afterCalendar.page.published).toEqual(saved.page.published);
  await call("calendar_schedule_publish", {
    calendarId: calendar.id,
    id: schedule.id,
    expectedVersion: savedSchedule.version,
    confirmed: true,
  });
  await call("calendar_page_publish", {
    expectedVersion: saved.page.version,
    confirmed: true,
  });
  const published = await call<CalendarWorkspace>("calendar_read", {});
  expect(
    published.calendars.find((item) => item.id === calendar.id),
  ).toMatchObject({
    version: savedCalendar.version + 1,
    published: savedCalendar.draft,
  });
  expect(
    published.schedules.find((item) => item.id === schedule.id),
  ).toMatchObject({
    version: savedSchedule.version + 1,
    published: savedSchedule.draft,
  });
  expect(published.page).toMatchObject({
    version: saved.page.version + 1,
    published: saved.page.draft,
  });
  const publicCalendar = await api.get(
    "/api/calendar?from=2026-10-19&to=2026-11-02&timezone=UTC",
  );
  expect(publicCalendar.status()).toBe(200);
  const feed = (await publicCalendar.json()) as CalendarFeed;
  expect(feed.calendars.map((item) => item.id)).not.toContain(calendar.id);
  expect(feed.occurrences.map((item) => item.sourceId)).not.toContain(
    schedule.id,
  );

  const publishedPage = await call<CmsDetail>("website_publish", {
    id: pageId,
    locale: "en",
    expectedRevisionId: page.draft.id,
    confirmed: true,
  });
  expect(publishedPage.publishedRevisionId).toBe(page.draft.id);
  expect(publishedPage.draft).toEqual(page.draft);
  expect((await api.get(`/pages/en/${page.draft.slug}`)).status()).toBe(200);
}
