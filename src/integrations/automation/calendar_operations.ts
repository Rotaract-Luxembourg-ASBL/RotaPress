import { z } from "zod";
import {
  calendarDefinitionSchema,
  calendarPageSchema,
  scheduleSchema,
} from "@/features/calendar/calendar_schemas";
import { receiptOperation } from "./receipt_operation";
import { requireReceiptCapability } from "./receipt_authority";
import { exampleId } from "./examples";

const version = z.int().positive();
const target = z.strictObject({ id: z.uuid(), expectedVersion: version });
const scheduleTarget = target.extend({ calendarId: z.uuid() });
const calendarDraft = z.strictObject({ definition: calendarDefinitionSchema });
const activityDraft = z.strictObject({
  calendarId: z.uuid(),
  definition: scheduleSchema,
});
const reviewUrl = "/admin/calendar";
const changed = z.strictObject({
  id: z.uuid(),
  version,
  reviewUrl: z.literal(reviewUrl),
});
const definition = {
  name: "Club activities",
  description: "Meetings and volunteering",
  color: "#25636b",
  timezone: "Europe/Luxembourg",
  audience: "members",
  eventSource: "none",
  eventIds: [],
};
const activity = {
  title: "Weekly club meeting",
  description: "Review club projects and upcoming activities.",
  location: "Club meeting room",
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

function calendarLifecycle(action: "archive" | "restore") {
  return receiptOperation(
    {
      name: `calendar_${action}`,
      effect: action === "archive" ? "archive" : "draft",
      method: "PATCH",
      path: `/calendar/calendars/{id}/${action}`,
      scope: "calendar:write",
      description: `${action === "archive" ? "Archive" : "Restore"} an unpublished calendar using its current expectedVersion. Published calendars require staff review in Calendar. No schedules are deleted or published.`,
      input: target,
      output: changed,
      example: { id: exampleId, expectedVersion: 1 },
    },
    requireReceiptCapability("calendar.manage"),
    async ({ services, principal }, input, tx) => ({
      ...(await services.calendar.calendar(
        principal.actor,
        { ...input, operation: action },
        { draftOnly: true },
        tx,
      )),
      reviewUrl,
    }),
  );
}

function activityLifecycle(action: "archive" | "restore") {
  return receiptOperation(
    {
      name: `calendar_schedule_${action}`,
      effect: action === "archive" ? "archive" : "draft",
      method: "PATCH",
      path: `/calendar/calendars/{calendarId}/schedules/{id}/${action}`,
      scope: "calendar:write",
      description: `${action === "archive" ? "Archive" : "Restore"} an unpublished activity using expectedVersion and its owning calendarId. Published activities require staff review in Calendar.`,
      input: scheduleTarget,
      output: changed,
      example: { calendarId: exampleId, id: exampleId, expectedVersion: 1 },
    },
    requireReceiptCapability("calendar.manage"),
    async ({ services, principal }, input, tx) => ({
      ...(await services.calendar.schedule(
        principal.actor,
        { ...input, operation: action },
        { draftOnly: true },
        tx,
      )),
      reviewUrl,
    }),
  );
}

export const calendarOperations = [
  receiptOperation(
    {
      name: "calendar_create",
      effect: "draft",
      method: "POST",
      path: "/calendar/calendars",
      scope: "calendar:write",
      description:
        "Create a private calendar draft with audience, color, time zone and event selection. Publication is separate.",
      input: calendarDraft,
      output: changed,
      example: { definition },
    },
    requireReceiptCapability("calendar.manage"),
    async ({ services, principal }, input, tx) => ({
      ...(await services.calendar.calendar(
        principal.actor,
        { ...input, operation: "save", expectedVersion: 0 },
        { draftOnly: true },
        tx,
      )),
      reviewUrl,
    }),
  ),
  receiptOperation(
    {
      name: "calendar_save",
      effect: "draft",
      method: "PATCH",
      path: "/calendar/calendars/{id}",
      scope: "calendar:write",
      description:
        "Replace calendar draft details using the current expectedVersion from calendar_read. Existing published details and audiences remain unchanged. Use calendar_publish only with calendar:publish and an explicit user request.",
      input: calendarDraft.extend(target.shape),
      output: changed,
      example: { id: exampleId, expectedVersion: 1, definition },
    },
    requireReceiptCapability("calendar.manage"),
    async ({ services, principal }, input, tx) => ({
      ...(await services.calendar.calendar(
        principal.actor,
        { ...input, operation: "save" },
        { draftOnly: true },
        tx,
      )),
      reviewUrl,
    }),
  ),
  calendarLifecycle("archive"),
  calendarLifecycle("restore"),
  receiptOperation(
    {
      name: "calendar_schedule_create",
      effect: "draft",
      method: "POST",
      path: "/calendar/calendars/{calendarId}/schedules",
      scope: "calendar:write",
      description:
        "Add a private activity to a calendar. Supports one-off and recurring schedules, time zones, all-day dates and skipped occurrences. Publishing requires the separate calendar:publish grant and an explicit user request.",
      input: activityDraft,
      output: changed,
      example: { calendarId: exampleId, definition: activity },
    },
    requireReceiptCapability("calendar.manage"),
    async ({ services, principal }, input, tx) => ({
      ...(await services.calendar.schedule(
        principal.actor,
        { ...input, operation: "save", expectedVersion: 0 },
        { draftOnly: true },
        tx,
      )),
      reviewUrl,
    }),
  ),
  receiptOperation(
    {
      name: "calendar_schedule_save",
      effect: "draft",
      method: "PATCH",
      path: "/calendar/calendars/{calendarId}/schedules/{id}",
      scope: "calendar:write",
      description:
        "Edit a complete activity draft with its current expectedVersion. Change timing, recurrence, skipped dates or cancellation in the draft. Published activities and notifications remain unchanged.",
      input: activityDraft.extend(target.shape),
      output: changed,
      example: {
        calendarId: exampleId,
        id: exampleId,
        expectedVersion: 1,
        definition: activity,
      },
    },
    requireReceiptCapability("calendar.manage"),
    async ({ services, principal }, input, tx) => ({
      ...(await services.calendar.schedule(
        principal.actor,
        { ...input, operation: "save" },
        { draftOnly: true },
        tx,
      )),
      reviewUrl,
    }),
  ),
  activityLifecycle("archive"),
  activityLifecycle("restore"),
  receiptOperation(
    {
      name: "calendar_page_save",
      effect: "draft",
      method: "PATCH",
      path: "/calendar/page",
      scope: "calendar:design",
      description:
        "Save the built-in calendar page's draft title, introduction, calendar selection, view and time zone using expectedVersion from calendar_read. Use calendar_page_publish only with calendar:publish and an explicit user request.",
      input: z.strictObject({
        expectedVersion: z.int().nonnegative(),
        definition: calendarPageSchema,
      }),
      output: z.strictObject({
        saved: z.literal(true),
        version,
        reviewUrl: z.literal(reviewUrl),
      }),
      example: {
        expectedVersion: 0,
        definition: {
          title: "Club calendar",
          introduction: "See what is coming up.",
          calendarIds: [],
          view: "agenda",
          timezone: "Europe/Luxembourg",
        },
      },
    },
    requireReceiptCapability("calendar.manage"),
    async ({ services, principal }, input, tx) => ({
      ...(await services.calendar.page(
        principal.actor,
        {
          ...input,
          operation: "save",
        },
        tx,
      )),
      reviewUrl,
    }),
  ),
];
