import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { calendarSource } from "../../db/schema/calendar-sources";
import { CalendarSourceService } from "../../src/features/calendar/CalendarSourceService";
import { IcalendarAdapter } from "../../src/features/calendar/providers/IcalendarAdapter";
import {
  CalendarFeedClient,
  calendarFeedUrlSchema,
} from "../../src/features/calendar/providers/CalendarFeedClient";
import { CredentialCipher } from "../../src/infrastructure/security/CredentialCipher";
import { FeatureService } from "../../src/core/features/FeatureService";
import { calendarFixture } from "./calendar-cases";
import type { Context } from "./luma-sync-fixture";

export const importedCalendar = (title = "Synthetic imported activity") =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Synthetic//Calendar//EN",
    "BEGIN:VEVENT",
    "UID:synthetic-series",
    "DTSTART;TZID=Europe/Luxembourg:20261019T180000",
    "DTEND;TZID=Europe/Luxembourg:20261019T190000",
    "RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=MO",
    "SUMMARY:" + title,
    "LOCATION:Synthetic hall",
    "ATTENDEE:mailto:private-participant@example.test",
    "ORGANIZER:mailto:private-organizer@example.test",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT15M",
    "DESCRIPTION:Do not import",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
const range = {
  from: "2026-10-01",
  to: "2026-11-08",
  timezone: "Europe/Luxembourg",
  calendarIds: [],
};

export function calendarSourceChecks(get: () => Context) {
  it("C13 calendar import: respects recurrence, exclusions and time zones without importing participant records", () => {
    const adapter = new IcalendarAdapter();
    const id = randomUUID();
    const clean = adapter.normalize(importedCalendar(), "UTC");
    expect(clean).not.toContain("ATTENDEE");
    expect(clean).not.toContain("ORGANIZER");
    expect(clean).not.toContain("VALARM");
    const items = adapter.occurrences(clean, "UTC", id, id, range);
    expect(items.map((o) => o.startsAt)).toEqual([
      "2026-10-19T16:00:00Z",
      "2026-10-26T17:00:00Z",
      "2026-11-02T17:00:00Z",
    ]);
    expect(new Set(items.map((o) => o.id)).size).toBe(3);
    const exclusion = importedCalendar().replace(
      "SUMMARY:",
      "EXDATE;TZID=Europe/Luxembourg:20261026T180000\r\nSUMMARY:",
    );
    expect(
      adapter.occurrences(
        adapter.normalize(exclusion, "UTC"),
        "UTC",
        id,
        id,
        range,
      ),
    ).toHaveLength(2);
    const exception = importedCalendar().replace(
      "END:VCALENDAR",
      [
        "BEGIN:VEVENT",
        "UID:synthetic-series",
        "RECURRENCE-ID;TZID=Europe/Luxembourg:20261026T180000",
        "DTSTART;TZID=Europe/Luxembourg:20261026T200000",
        "DTEND;TZID=Europe/Luxembourg:20261026T210000",
        "SUMMARY:Moved synthetic activity",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
    const moved = adapter.occurrences(
      adapter.normalize(exception, "UTC"),
      "UTC",
      id,
      id,
      range,
    );
    expect(
      moved.find((i) => i.title === "Moved synthetic activity")?.startsAt,
    ).toBe("2026-10-26T19:00:00Z");
    const beyond = exception
      .replace(
        "DTSTART;TZID=Europe/Luxembourg:20261026T200000",
        "DTSTART;TZID=Europe/Luxembourg:20261226T200000",
      )
      .replace(
        "DTEND;TZID=Europe/Luxembourg:20261026T210000",
        "DTEND;TZID=Europe/Luxembourg:20261226T210000",
      );
    expect(
      adapter
        .occurrences(adapter.normalize(beyond, "UTC"), "UTC", id, id, range)
        .map((i) => i.date),
    ).toEqual(["2026-10-19", "2026-11-02"]);
    const incoming = exception
      .replace("20261026T180000", "20261102T180000")
      .replace("20261026T200000", "20261020T200000")
      .replace("20261026T210000", "20261020T210000");
    expect(
      adapter
        .occurrences(adapter.normalize(incoming, "UTC"), "UTC", id, id, {
          ...range,
          to: "2026-10-25",
        })
        .map((i) => i.date),
    ).toEqual(["2026-10-19", "2026-10-20"]);
    expect(() =>
      adapter.normalize(
        importedCalendar().replace("FREQ=WEEKLY", "FREQ=SECONDLY"),
        "UTC",
      ),
    ).toThrow();
    expect(() =>
      adapter.normalize(
        importedCalendar().replaceAll("Europe/Luxembourg", "Unknown/Zone"),
        "UTC",
      ),
    ).toThrow();
    expect(() => adapter.normalize("X".repeat(524289), "UTC")).toThrow();
  });
  it("C13 calendar import: requires current scope, reviewed digest and publication, keeping source URLs encrypted", async () => {
    const f = await calendarFixture(get);
    const transport = {
      enabled: true,
      read: vi.fn().mockResolvedValue(importedCalendar()),
    };
    const sources = new CalendarSourceService(
      f.db,
      f.authorization,
      transport,
      new CredentialCipher(randomBytes(32).toString("hex")),
      async () => ({
        actor: f.owner,
        expiresAt: new Date(Date.now() + 3600000),
      }),
    );
    const values = {
      calendarId: f.id,
      provider: "ical",
      document: importedCalendar(),
      timezone: "Europe/Luxembourg",
    };
    await expect(sources.preview(f.manager, values)).rejects.toMatchObject({
      status: 403,
    });
    const preview = await sources.preview(f.owner, values);
    expect(await f.db.select().from(calendarSource)).toHaveLength(0);
    const input = {
      ...values,
      id: randomUUID(),
      name: "Synthetic file",
      expectedDigest: preview.digest,
      endpoint:
        "https://calendar.example.org/private-synthetic-feed?token=synthetic-only",
      automatic: false,
    };
    await expect(
      sources.create(f.owner, { ...input, expectedDigest: "0".repeat(64) }),
    ).rejects.toMatchObject({ status: 409 });
    await sources.create(f.owner, input);
    await sources.create(f.owner, input);
    await expect(
      sources.create(f.owner, { ...input, automatic: true }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      sources.create(f.owner, {
        ...input,
        endpoint: "https://calendar.example.org/different.ics",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const [stored] = await f.db.select().from(calendarSource);
    expect(stored.endpoint).not.toContain("synthetic-only");
    expect(JSON.stringify(await sources.workspace(f.owner))).not.toContain(
      "private-synthetic-feed",
    );
    expect((await f.reader.feed(null, range)).occurrences).toEqual([]);
    await sources.operation(f.owner, {
      id: input.id,
      expectedVersion: 1,
      operation: "publish",
    });
    const first = await f.reader.feed(null, range);
    expect(first.occurrences).toHaveLength(3);
    expect(JSON.stringify(first)).not.toMatch(
      /private-participant|private-organizer|synthetic-only/,
    );
    transport.read.mockResolvedValue(importedCalendar("Updated import"));
    await sources.refresh(f.owner, input.id, 2);
    expect((await f.reader.feed(null, range)).occurrences[0].title).toBe(
      "Synthetic imported activity",
    );
    expect((await sources.workspace(f.owner)).items[0].changed).toBe(true);
    await expect(
      sources.operation(f.owner, {
        id: input.id,
        expectedVersion: 2,
        operation: "publish",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await sources.operation(f.owner, {
      id: input.id,
      expectedVersion: 3,
      operation: "publish",
    });
    expect((await f.reader.feed(null, range)).occurrences[0].title).toBe(
      "Updated import",
    );
    await sources.operation(f.owner, {
      id: input.id,
      expectedVersion: 4,
      operation: "pause",
    });
    expect((await f.reader.feed(null, range)).occurrences).toEqual([]);
    await sources.operation(f.owner, {
      id: input.id,
      expectedVersion: 5,
      operation: "remove",
    });
    expect(await f.db.select().from(calendarSource)).toHaveLength(0);
  });
  it("C13 calendar sync: deduplicates refreshes, retains manual schedules and last good content through failure or expired authority", async () => {
    const f = await calendarFixture(get);
    await f.add();
    let alive = true;
    const transport = {
      enabled: true,
      read: vi
        .fn()
        .mockResolvedValue(importedCalendar("Changed by remote feed")),
    };
    const sources = new CalendarSourceService(
      f.db,
      f.authorization,
      transport,
      new CredentialCipher(randomBytes(32).toString("hex")),
      async () =>
        alive
          ? { actor: f.owner, expiresAt: new Date(Date.now() + 3600000) }
          : null,
    );
    const values = {
      calendarId: f.id,
      provider: "ical",
      document: importedCalendar(),
      timezone: "Europe/Luxembourg",
    };
    const preview = await sources.preview(f.owner, values);
    const id = randomUUID();
    await sources.create(f.owner, {
      ...values,
      id,
      name: "Synthetic synchronized feed",
      expectedDigest: preview.digest,
      endpoint: "https://calendar.example.org/fixture.ics",
      automatic: true,
    });
    await sources.operation(f.owner, {
      id,
      expectedVersion: 1,
      operation: "publish",
    });
    await Promise.all([sources.runBatch(), sources.runBatch()]);
    expect(transport.read).toHaveBeenCalledTimes(1);
    let feed = await f.reader.feed(null, range);
    expect(feed.occurrences).toHaveLength(6);
    expect(
      feed.occurrences.filter((o) => o.title === "Changed by remote feed"),
    ).toHaveLength(3);
    await f.db
      .update(calendarSource)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(calendarSource.id, id));
    transport.read.mockRejectedValueOnce(
      new Error("synthetic network failure"),
    );
    expect((await sources.runBatch()).refreshed).toBe(0);
    expect((await f.reader.feed(null, range)).occurrences).toEqual(
      feed.occurrences,
    );
    await f.db
      .update(calendarSource)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(calendarSource.id, id));
    alive = false;
    await sources.runBatch();
    expect(transport.read).toHaveBeenCalledTimes(2);
    feed = await f.reader.feed(null, range);
    expect(feed.occurrences).toHaveLength(6);
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
    alive = true;
    await f.db
      .update(calendarSource)
      .set({ nextSyncAt: new Date(0) })
      .where(eq(calendarSource.id, id));
    await sources.runBatch();
    expect(transport.read).toHaveBeenCalledTimes(2);
    await sources.operation(f.owner, {
      id,
      expectedVersion: 3,
      operation: "resume",
    });
    await sources.runBatch();
    expect(transport.read).toHaveBeenCalledTimes(3);
  });
  it("C13 calendar sync: blocks credentials, non-HTTPS targets and private or mixed DNS before an outbound request", async () => {
    for (const url of [
      "http://calendar.example.org/feed",
      "https://127.0.0.1/feed",
      "https://calendar.internal/feed",
      "https://user:secret@calendar.example.org/feed",
      "https://calendar.example.org:8443/feed",
    ])
      expect(calendarFeedUrlSchema.safeParse(url).success).toBe(false);
    const blocked = new CalendarFeedClient(true, async () => [
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      blocked.read("https://calendar.example.org/feed"),
    ).rejects.toThrow("FEED_ADDRESS_BLOCKED");
    const mixed = new CalendarFeedClient(true, async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(
      mixed.read("https://calendar.example.org/feed"),
    ).rejects.toThrow("FEED_ADDRESS_BLOCKED");
    await expect(
      new CalendarFeedClient(false).read("https://calendar.example.org/feed"),
    ).rejects.toThrow("CALENDAR_FEED_REQUESTS_DISABLED");
  });
}
