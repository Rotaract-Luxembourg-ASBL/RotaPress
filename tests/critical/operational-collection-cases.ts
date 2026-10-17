import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { clubEvent, eventManager } from "../../db/schema/events";
import { calendarSchedule } from "../../db/schema/calendar";
import type { Context } from "./luma-sync-fixture";
import { activity, calendarFixture } from "./calendar-cases";

export function operationalCollectionChecks(get: () => Context) {
  it("C06 paginates event collections with accurate assignment-scoped counts and exact offset", async () => {
    const s = get();
    const { owner, manager, scope } = await s.club();
    const rows = Array.from({ length: 43 }, (_, index) => ({
      id: randomUUID(),
      organizationId: scope.organizationId,
      createdBy: owner.userId,
      title: `Event ${String(index).padStart(3, "0")}`,
      startsAt: new Date("2099-12-01T17:00:00Z"),
      timezone: "Europe/Luxembourg",
    }));
    await s.db.insert(clubEvent).values(rows);
    await s.db
      .insert(eventManager)
      .values(
        rows.map((row, index) => ({
          eventId: row.id,
          organizationId: scope.organizationId,
          userId: index % 2 ? owner.userId : manager.userId,
          role: "manager" as const,
        })),
      );
    const first = await s.events.query(owner, { pageSize: 10, sort: "title" });
    const last = await s.events.query(owner, {
      pageSize: 10,
      page: 5,
      sort: "title",
    });
    expect(first).toMatchObject({
      total: 43,
      counts: { active: 43, draft: 43, upcoming: 43 },
    });
    expect(last.events).toHaveLength(3);
    expect(
      new Set([...first.events, ...last.events].map((row) => row.id)).size,
    ).toBe(13);
    expect(
      (
        await s.events.query(owner, { offset: 3, pageSize: 2, sort: "title" })
      ).events.map((row) => row.title),
    ).toEqual(["Event 003", "Event 004"]);
    const assigned = await s.events.query(manager, {
      pageSize: 10,
      page: 3,
      sort: "title",
    });
    expect(assigned).toMatchObject({ total: 22, counts: { all: 22 } });
    expect(assigned.events.map((row) => row.title)).toEqual([
      "Event 040",
      "Event 042",
    ]);
    expect((await s.events.query(manager, { search: "%" })).total).toBe(0);
    await expect(
      s.events.query(await s.actor("unapproved"), {}),
    ).rejects.toThrow();
  });

  it("C13 paginates activities without loading the entire workspace and keeps totals scoped", async () => {
    const s = await calendarFixture(get);
    await s.db
      .insert(calendarSchedule)
      .values(
        Array.from({ length: 103 }, (_, index) => ({
          organizationId: s.scope.organizationId,
          calendarId: s.id,
          draft: { ...activity, title: `Activity ${index}` },
        })),
      );
    const result = await s.service.schedules(s.owner, {
      calendarId: s.id,
      page: 4,
      pageSize: 30,
    });
    expect(result).toMatchObject({
      total: 103,
      page: 4,
      counts: { active: 103, draft: 103, published: 0 },
    });
    expect(result.items).toHaveLength(13);
    expect((await s.service.workspace(s.owner, false)).schedules).toEqual([]);
    expect(
      (await s.service.schedules(s.owner, { calendarId: randomUUID() })).total,
    ).toBe(0);
    await expect(s.service.schedules(s.manager, {})).rejects.toThrow();
  });
}
