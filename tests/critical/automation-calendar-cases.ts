import { expect, it } from "vitest";
import {
  activity,
  calendarDefinition,
  calendarFixture,
} from "./calendar-cases";
import type { Context } from "./luma-sync-fixture";
import { executeOperation } from "../../src/integrations/automation/catalogue";
import type { AutomationContext } from "../../src/integrations/automation/operation";

export function automationCalendarChecks(get: () => Context) {
  it("C14 calendar drafts: edits published items without altering their public snapshots and blocks automated unpublication", async () => {
    const f = await calendarFixture(get);
    const scheduleId = await f.add();
    const draftOnly = { draftOnly: true };
    const calendar = await f.service.calendar(
      f.owner,
      {
        id: f.id,
        operation: "save",
        expectedVersion: 2,
        definition: {
          ...calendarDefinition,
          name: "Draft-only new name",
          audience: "members",
        },
      },
      draftOnly,
    );
    const schedule = await f.service.schedule(
      f.owner,
      {
        id: scheduleId,
        calendarId: f.id,
        operation: "save",
        expectedVersion: 2,
        definition: {
          ...activity,
          cancelled: true,
          skippedDates: ["2026-10-26"],
        },
      },
      draftOnly,
    );
    expect(calendar.version).toBe(3);
    expect(schedule.version).toBe(3);
    for (const operation of ["publish", "unpublish", "archive", "restore"]) {
      await expect(
        f.service.calendar(
          f.owner,
          {
            id: f.id,
            operation,
            expectedVersion: 3,
          },
          draftOnly,
        ),
      ).rejects.toMatchObject({ code: "CALENDAR_PUBLICATION_MANUAL" });
      await expect(
        f.service.schedule(
          f.owner,
          {
            id: scheduleId,
            calendarId: f.id,
            operation,
            expectedVersion: 3,
          },
          draftOnly,
        ),
      ).rejects.toMatchObject({ code: "CALENDAR_PUBLICATION_MANUAL" });
    }
    await expect(
      f.service.calendar(
        f.owner,
        {
          id: f.id,
          operation: "save",
          expectedVersion: 2,
          definition: calendarDefinition,
        },
        draftOnly,
      ),
    ).rejects.toMatchObject({ code: "CALENDAR_CHANGED" });
    const saved = await f.service.workspace(f.owner);
    expect(saved.calendars.find((item) => item.id === f.id)).toMatchObject({
      version: 3,
      archived: false,
      draft: { name: "Draft-only new name", audience: "members" },
      published: calendarDefinition,
    });
    expect(
      saved.schedules.find((item) => item.id === scheduleId),
    ).toMatchObject({
      version: 3,
      archived: false,
      draft: { cancelled: true, skippedDates: ["2026-10-26"] },
      published: activity,
    });
  });

  it("C14 calendar drafts: creates, archives and restores private calendars and activities with current versions", async () => {
    const f = await calendarFixture(get);
    const draftOnly = { draftOnly: true };
    const created = await f.service.calendar(
      f.owner,
      {
        operation: "save",
        expectedVersion: 0,
        definition: calendarDefinition,
      },
      draftOnly,
    );
    const schedule = await f.service.schedule(
      f.owner,
      {
        calendarId: created.id,
        operation: "save",
        expectedVersion: 0,
        definition: activity,
      },
      draftOnly,
    );
    await expect(
      f.service.schedule(
        f.owner,
        {
          id: schedule.id,
          calendarId: f.id,
          operation: "archive",
          expectedVersion: 1,
        },
        draftOnly,
      ),
    ).rejects.toMatchObject({ code: "SCHEDULE_NOT_FOUND" });
    await f.service.schedule(
      f.owner,
      {
        id: schedule.id,
        calendarId: created.id,
        operation: "archive",
        expectedVersion: 1,
      },
      draftOnly,
    );
    await f.service.calendar(
      f.owner,
      { id: created.id, operation: "archive", expectedVersion: 1 },
      draftOnly,
    );
    // Restore the parent before managing its activities again.
    await f.service.calendar(
      f.owner,
      { id: created.id, operation: "restore", expectedVersion: 2 },
      draftOnly,
    );
    await f.service.schedule(
      f.owner,
      {
        id: schedule.id,
        calendarId: created.id,
        operation: "restore",
        expectedVersion: 2,
      },
      draftOnly,
    );
    const page = {
      title: "Published calendar",
      introduction: "Original",
      calendarIds: [f.id],
      view: "month",
      timezone: "Europe/Luxembourg",
    };
    await f.service.page(f.owner, {
      operation: "save",
      expectedVersion: 0,
      definition: page,
    });
    await f.service.page(f.owner, { operation: "publish", expectedVersion: 1 });
    expect(
      await f.service.page(f.owner, {
        operation: "save",
        expectedVersion: 2,
        definition: {
          ...page,
          title: "Draft calendar design",
          view: "agenda",
          calendarIds: [created.id],
        },
      }),
    ).toEqual({ saved: true, version: 3 });
    const saved = await f.service.workspace(f.owner);
    expect(
      saved.calendars.find((item) => item.id === created.id),
    ).toMatchObject({
      version: 3,
      archived: false,
      published: null,
    });
    expect(
      saved.schedules.find((item) => item.id === schedule.id),
    ).toMatchObject({
      version: 3,
      archived: false,
      published: null,
    });
    expect(saved.page).toMatchObject({
      version: 3,
      draft: { title: "Draft calendar design", view: "agenda" },
      published: page,
    });
  });

  it("C14 calendar publication: publishes only confirmed saved versions with its own grant and the correct parent", async () => {
    const f = await calendarFixture(get);
    const created = await f.service.calendar(f.owner, {
      operation: "save",
      expectedVersion: 0,
      definition: calendarDefinition,
    });
    const schedule = await f.service.schedule(f.owner, {
      operation: "save",
      calendarId: created.id,
      expectedVersion: 0,
      definition: activity,
    });
    const page = {
      title: "Confirmed community calendar",
      introduction: "Synthetic published design",
      calendarIds: [created.id],
      view: "agenda",
      timezone: "Europe/Luxembourg",
    };
    await f.service.page(f.owner, {
      operation: "save",
      expectedVersion: 0,
      definition: page,
    });
    // Only the authorization and calendar dependencies are used by these tools.
    const context = {
      services: { authorization: f.authorization, calendar: f.service },
      principal: {
        actor: f.owner,
        organizationId: f.scope.organizationId,
        scopes: ["calendar:publish"],
      },
    } as unknown as AutomationContext;
    const input = { id: created.id, expectedVersion: 1, confirmed: true };
    await expect(
      executeOperation(
        {
          ...context,
          principal: { ...context.principal, scopes: ["calendar:write"] },
        },
        "calendar_publish",
        input,
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
    await expect(
      executeOperation(context, "calendar_publish", {
        ...input,
        confirmed: false,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      f.service.calendar(
        f.owner,
        { id: created.id, expectedVersion: 1, operation: "publish" },
        { draftOnly: true },
      ),
    ).rejects.toMatchObject({ code: "CALENDAR_PUBLICATION_MANUAL" });
    await expect(
      executeOperation(context, "calendar_schedule_publish", {
        id: schedule.id,
        calendarId: f.id,
        expectedVersion: 1,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "SCHEDULE_NOT_FOUND" });
    const publications = [
      { name: "calendar_publish", input, result: { id: created.id } },
      {
        name: "calendar_schedule_publish",
        input: { ...input, id: schedule.id, calendarId: created.id },
        result: { id: schedule.id },
      },
      {
        name: "calendar_page_publish",
        input: { expectedVersion: 1, confirmed: true },
        result: { saved: true },
      },
    ];
    for (const publication of publications) {
      expect(
        await executeOperation(context, publication.name, publication.input),
      ).toEqual({
        ...publication.result,
        version: 2,
        reviewUrl: "/admin/calendar",
      });
      await expect(
        executeOperation(context, publication.name, publication.input),
      ).rejects.toMatchObject({ code: "CALENDAR_CHANGED" });
    }
    const saved = await f.service.workspace(f.owner);
    expect(
      saved.calendars.find((item) => item.id === created.id)?.published,
    ).toEqual(calendarDefinition);
    expect(
      saved.schedules.find((item) => item.id === schedule.id)?.published,
    ).toEqual(activity);
    expect(saved.page.published).toEqual(page);
    expect(
      (await f.reader.visible(null)).some((item) => item.id === created.id),
    ).toBe(true);
    // No notification runner or real delivery is invoked by this fixture.
  });
}
