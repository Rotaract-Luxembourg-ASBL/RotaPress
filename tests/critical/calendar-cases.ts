import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import {
  calendarNotification,
  calendarSchedule,
  calendarSubscription,
} from "../../db/schema/calendar";
import { membership } from "../../db/schema/club";
import { CalendarReader } from "../../src/features/calendar/CalendarReader";
import { CalendarService } from "../../src/features/calendar/CalendarService";
import { CalendarSubscriptionService } from "../../src/features/calendar/CalendarSubscriptionService";
import { CalendarNotificationRunner } from "../../src/features/calendar/CalendarNotificationRunner";
import {
  calendarDefinitionSchema,
  scheduleSchema,
  type ScheduleDefinition,
} from "../../src/features/calendar/calendar_schemas";
import {
  scheduleOccurrences,
  validateSchedule,
} from "../../src/features/calendar/calendar_dates";
import { calendarIcal } from "../../src/features/calendar/calendar_ical";
import { FeatureService } from "../../src/core/features/FeatureService";
import type { PublicEventCard } from "../../src/features/events/event_catalogue";
import type { Context } from "./luma-sync-fixture";

export const calendarDefinition = calendarDefinitionSchema.parse({
  name: "Synthetic community life",
  description: "Synthetic public schedule",
  color: "#25636b",
  audience: "public",
  timezone: "Europe/Luxembourg",
  eventSource: "none",
  eventIds: [],
});
export const activity = scheduleSchema.parse({
  title: "Synthetic weekly meeting",
  description: "A synthetic activity",
  location: "Synthetic room",
  url: "/events",
  date: "2026-10-19",
  time: "18:00",
  timezone: "Europe/Luxembourg",
  durationMinutes: 60,
  allDay: false,
  days: 1,
  repeat: "weekly",
  interval: 1,
  weekdays: [1],
  until: "2026-11-03",
  skippedDates: [],
  cancelled: false,
});
const range = {
  from: "2026-10-01",
  to: "2026-11-08",
  timezone: "Europe/Luxembourg",
  calendarIds: [],
};

export async function calendarFixture(
  get: () => Context,
  eventSource: () => Promise<PublicEventCard[]> = async () => [],
) {
  const c = get();
  const people = await c.club();
  const reader = new CalendarReader(c.db, eventSource);
  const service = new CalendarService(c.db, c.authorization, reader);
  const subscriptions = new CalendarSubscriptionService(c.db, reader);
  const created = await service.calendar(people.owner, {
    operation: "save",
    expectedVersion: 0,
    definition: calendarDefinition,
  });
  await service.calendar(people.owner, {
    operation: "publish",
    id: created.id,
    expectedVersion: 1,
  });
  async function add(
    definition: ScheduleDefinition = activity,
    calendarId = created.id,
  ) {
    const saved = await service.schedule(people.owner, {
      operation: "save",
      calendarId,
      expectedVersion: 0,
      definition,
    });
    await service.schedule(people.owner, {
      operation: "publish",
      calendarId,
      id: saved.id,
      expectedVersion: 1,
    });
    return saved.id;
  }
  return {
    ...c,
    ...people,
    reader,
    service,
    subscriptions,
    id: created.id,
    add,
  };
}
export function calendarChecks(get: () => Context) {
  it("C13 calendar: preserves wall time across DST, repeat intervals, skipped dates and exclusive all-day ends", () => {
    const id = randomUUID();
    const items = scheduleOccurrences(id, id, activity, range);
    expect(items.map((i) => i.startsAt)).toEqual([
      "2026-10-19T16:00:00Z",
      "2026-10-26T17:00:00Z",
      "2026-11-02T17:00:00Z",
    ]);
    expect(
      scheduleOccurrences(
        id,
        id,
        { ...activity, skippedDates: ["2026-10-26"] },
        range,
      ),
    ).toHaveLength(2);
    expect(
      scheduleOccurrences(id, id, { ...activity, interval: 2 }, range),
    ).toHaveLength(2);
    const daily = scheduleOccurrences(
      id,
      id,
      {
        ...activity,
        date: "2026-03-28",
        time: "02:30",
        repeat: "daily",
        until: "2026-03-30",
      },
      { ...range, from: "2026-03-28", to: "2026-03-31" },
    );
    expect(daily.map((i) => i.startsAt)).toEqual([
      "2026-03-28T01:30:00Z",
      "2026-03-29T01:30:00Z",
      "2026-03-30T00:30:00Z",
    ]);
    const monthly = scheduleOccurrences(
      id,
      id,
      { ...activity, date: "2026-01-31", repeat: "monthly", until: "" },
      { ...range, from: "2026-01-01", to: "2026-04-01" },
    );
    expect(monthly.map((i) => i.date)).toEqual(["2026-01-31", "2026-03-31"]);
    const allDay = scheduleOccurrences(
      id,
      id,
      {
        ...activity,
        date: "2026-03-29",
        repeat: "once",
        allDay: true,
        until: "",
      },
      { ...range, from: "2026-03-28", to: "2026-03-31" },
    )[0];
    expect(
      new Date(allDay.endsAt).getTime() - new Date(allDay.startsAt).getTime(),
    ).toBe(23 * 3600000);
    expect(calendarIcal([allDay], "http://127.0.0.1:4100")).toContain(
      "DTEND;VALUE=DATE:20260330",
    );
    expect(
      scheduleOccurrences(
        id,
        id,
        {
          ...activity,
          date: "2026-03-29",
          timezone: "Etc/GMT+12",
          repeat: "once",
          allDay: true,
          until: "",
        },
        {
          ...range,
          from: "2026-03-29",
          to: "2026-03-30",
          timezone: "Pacific/Kiritimati",
        },
      ),
    ).toHaveLength(1);
    const injected = calendarIcal(
      [
        {
          ...allDay,
          title: "A\nATTENDEE:secret@example.test",
          description: "é".repeat(100),
        },
      ],
      "http://127.0.0.1:4100",
    );
    expect(injected).not.toContain("\r\nATTENDEE:");
    expect(
      injected.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
    ).toBe(true);
    expect(() =>
      validateSchedule({ ...activity, date: "2026-02-30" }),
    ).toThrow();
  });
  it("C13 calendar: enforces draft publication, approved membership, scope, version and archived boundaries", async () => {
    const f = await calendarFixture(get);
    const guest = await f.actor("calendar-guest");
    await expect(f.service.workspace(guest)).rejects.toMatchObject({
      status: 403,
    });
    await expect(f.service.workspace(f.manager)).rejects.toMatchObject({
      status: 403,
    });
    const saved = await f.service.schedule(f.owner, {
      operation: "save",
      expectedVersion: 0,
      calendarId: f.id,
      definition: activity,
    });
    expect((await f.reader.feed(null, range)).occurrences).toEqual([]);
    await f.service.schedule(f.owner, {
      operation: "publish",
      expectedVersion: 1,
      calendarId: f.id,
      id: saved.id,
    });
    expect((await f.reader.feed(null, range)).occurrences).toHaveLength(3);
    await expect(
      f.service.schedule(f.owner, {
        operation: "save",
        expectedVersion: 1,
        calendarId: f.id,
        id: saved.id,
        definition: activity,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await f.service.calendar(f.owner, {
      operation: "save",
      expectedVersion: 2,
      id: f.id,
      definition: {
        ...calendarDefinition,
        name: "Private member calendar",
        audience: "members",
      },
    });
    expect((await f.reader.feed(null, range)).calendars[0].name).toBe(
      calendarDefinition.name,
    );
    await f.service.calendar(f.owner, {
      operation: "publish",
      expectedVersion: 3,
      id: f.id,
    });
    expect((await f.reader.feed(null, range)).calendars).toEqual([]);
    expect((await f.reader.feed(guest, range)).occurrences).toEqual([]);
    expect((await f.reader.feed(f.manager, range)).occurrences).toHaveLength(3);
    await f.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, f.manager.userId));
    expect((await f.reader.feed(f.manager, range)).occurrences).toEqual([]);
    await expect(
      f.db.insert(calendarSchedule).values({
        organizationId: randomUUID(),
        calendarId: f.id,
        draft: activity,
      }),
    ).rejects.toThrow();
    await expect(
      f.service.schedule(f.owner, {
        operation: "publish",
        calendarId: randomUUID(),
        id: saved.id,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await f.service.calendar(f.owner, {
      operation: "archive",
      id: f.id,
      expectedVersion: 4,
    });
    expect((await f.reader.feed(f.owner, range)).occurrences).toEqual([]);
    await f.service.calendar(f.owner, {
      operation: "restore",
      id: f.id,
      expectedVersion: 5,
    });
    expect((await f.reader.feed(f.owner, range)).occurrences).toEqual([]);
    expect((await f.service.workspace(f.owner)).schedules).toHaveLength(1);
    await expect(
      f.reader.feed(null, { ...range, to: "2030-01-01" }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("C13 calendar: merges public event sources once and follows event withdrawal and feature availability", async () => {
    let events: PublicEventCard[] = [
      {
        id: randomUUID(),
        title: "Synthetic published event",
        description: "",
        startsAt: "2026-10-19T14:00:00Z",
        endsAt: null,
        timezone: "Europe/Luxembourg",
        venue: "",
        cancelled: false,
        href: "/events/synthetic/en/website",
        imageId: null,
      },
    ];
    const f = await calendarFixture(get, async () => events);
    await f.service.calendar(f.owner, {
      operation: "save",
      id: f.id,
      expectedVersion: 2,
      definition: { ...calendarDefinition, eventSource: "all" },
    });
    await f.service.calendar(f.owner, {
      operation: "publish",
      id: f.id,
      expectedVersion: 3,
    });
    const other = await f.service.calendar(f.owner, {
      operation: "save",
      expectedVersion: 0,
      definition: {
        ...calendarDefinition,
        name: "Another calendar",
        eventSource: "selected",
        eventIds: [events[0].id],
      },
    });
    await f.service.calendar(f.owner, {
      operation: "publish",
      id: other.id,
      expectedVersion: 1,
    });
    const feed = await f.reader.feed(null, range);
    expect(feed.occurrences).toHaveLength(1);
    expect(feed.occurrences[0].calendarIds).toHaveLength(2);
    const sources = await f.reader.sources(null, []);
    const dense = f.reader.project(
      {
        ...sources,
        schedules: Array.from({ length: 2001 }, (_, i) => ({
          id: String(i),
          calendarId: f.id,
          definition: { ...activity, repeat: "once" as const },
        })),
      },
      range,
    );
    expect(dense.occurrences).toHaveLength(2000);
    expect(dense.truncated).toBe(true);
    events = [];
    expect((await f.reader.feed(null, range)).occurrences).toEqual([]);
    await new FeatureService(f.db, f.authorization).configure(f.owner, {
      key: "calendar",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    expect((await f.reader.feed(f.owner, range)).calendars).toEqual([]);
    await expect(f.service.workspace(f.owner)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("C13 calendar: keeps subscriptions self-owned and retries reminders without duplicate notices", async () => {
    const f = await calendarFixture(get);
    const guest = await f.actor("subscribed-guest");
    const outsider = await f.actor("other-guest");
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 60000);
    await f.add({
      ...activity,
      timezone: "UTC",
      date: soon.toISOString().slice(0, 10),
      time: soon.toISOString().slice(11, 16),
      repeat: "once",
      until: "",
    });
    const input = {
      calendarId: f.id,
      active: true,
      email: true,
      updates: true,
      reminderMinutes: 60,
    };
    await f.subscriptions.save(guest, input);
    await expect(
      f.subscriptions.save(guest, { ...input, userId: outsider.userId }),
    ).rejects.toThrow();
    expect((await f.subscriptions.workspace(outsider)).items).toEqual([]);
    const mailer = {
      sendCalendarNotification: vi
        .fn()
        .mockRejectedValueOnce(new Error("synthetic SMTP failure"))
        .mockResolvedValue(undefined),
    };
    const runner = new CalendarNotificationRunner(
      f.db,
      f.reader,
      mailer,
      "http://127.0.0.1:4100",
    );
    expect((await runner.runBatch(5, now)).deferred).toBe(1);
    expect(await f.db.select().from(calendarNotification)).toHaveLength(1);
    await f.db.update(calendarNotification).set({ availableAt: new Date(0) });
    await Promise.all([runner.runBatch(5, now), runner.runBatch(5, now)]);
    expect(await f.db.select().from(calendarNotification)).toHaveLength(1);
    expect(mailer.sendCalendarNotification).toHaveBeenCalledTimes(2);
    const [notice] = await f.db.select().from(calendarNotification);
    expect(notice.status).toBe("sent");
    expect(mailer.sendCalendarNotification.mock.calls[1][0]).toBe(guest.email);
    expect(
      mailer.sendCalendarNotification.mock.calls[1].join(" "),
    ).not.toContain(activity.title);
    await f.subscriptions.read(outsider, { id: notice.id });
    expect(
      (await f.db.select().from(calendarNotification))[0].readAt,
    ).toBeNull();
    await f.subscriptions.read(guest, { id: notice.id });
    expect((await f.subscriptions.workspace(guest)).notifications[0].read).toBe(
      true,
    );
    const features = new FeatureService(f.db, f.authorization);
    await features.configure(f.owner, {
      key: "calendar",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    await features.configure(f.owner, {
      key: "calendar",
      enabled: true,
      expectedVersion: 1,
      confirmed: true,
    });
    expect((await f.subscriptions.workspace(guest)).items[0].paused).toBe(true);
    expect((await runner.runBatch()).sent).toBe(0);
    await f.subscriptions.save(guest, input);
    expect((await f.subscriptions.workspace(guest)).items[0].paused).toBe(
      false,
    );
    await f.subscriptions.save(guest, { ...input, active: false });
    expect((await f.subscriptions.workspace(guest)).notifications).toEqual([]);
    expect((await f.db.select().from(calendarSubscription))[0].active).toBe(
      false,
    );
  });
  it("C13 calendar: observes only published changes and suppresses queued member notices after revocation", async () => {
    const f = await calendarFixture(get);
    await f.add();
    await f.service.calendar(f.owner, {
      operation: "save",
      id: f.id,
      expectedVersion: 2,
      definition: { ...calendarDefinition, audience: "members" },
    });
    await f.service.calendar(f.owner, {
      operation: "publish",
      id: f.id,
      expectedVersion: 3,
    });
    const input = {
      calendarId: f.id,
      active: true,
      email: true,
      updates: true,
      reminderMinutes: 0,
    };
    const guest = await f.actor("calendar-unapproved");
    await expect(f.subscriptions.save(guest, input)).rejects.toMatchObject({
      status: 404,
    });
    await f.subscriptions.save(f.manager, input);
    const mailer = {
      sendCalendarNotification: vi
        .fn()
        .mockRejectedValue(new Error("synthetic offline")),
    };
    const runner = new CalendarNotificationRunner(
      f.db,
      f.reader,
      mailer,
      "http://127.0.0.1:4100",
    );
    await f.service.calendar(f.owner, {
      operation: "save",
      id: f.id,
      expectedVersion: 4,
      definition: {
        ...calendarDefinition,
        audience: "members",
        name: "Updated member calendar",
      },
    });
    await runner.runBatch();
    expect(mailer.sendCalendarNotification).not.toHaveBeenCalled();
    await f.service.calendar(f.owner, {
      operation: "publish",
      id: f.id,
      expectedVersion: 5,
    });
    expect((await runner.runBatch()).queued).toBe(1);
    await f.db
      .update(membership)
      .set({ status: "suspended" })
      .where(
        and(
          eq(membership.organizationId, f.scope.organizationId),
          eq(membership.userId, f.manager.userId),
        ),
      );
    await f.db.update(calendarNotification).set({ availableAt: new Date(0) });
    expect((await runner.runBatch()).cancelled).toBe(1);
    expect(mailer.sendCalendarNotification).toHaveBeenCalledTimes(1);
    expect((await f.subscriptions.workspace(f.manager)).notifications).toEqual(
      [],
    );
    await f.subscriptions.save(f.manager, { ...input, active: false });
  });
}
