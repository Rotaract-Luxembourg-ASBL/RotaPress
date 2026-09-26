import { z } from "zod";
import { operation } from "./operation";
import { exampleId } from "./examples";
import { publicationConfirmation } from "./publication_policy";

const version = z.int().positive();
const publication = z.strictObject({
  expectedVersion: version,
  confirmed: publicationConfirmation,
});
const calendarTarget = publication.extend({ id: z.uuid() });
const reviewUrl = "/admin/calendar";
const changed = z.strictObject({
  id: z.uuid(),
  version,
  reviewUrl: z.literal(reviewUrl),
});

export const calendarPublicationOperations = [
  operation(
    {
      name: "calendar_publish",
      method: "PATCH",
      path: "/calendar/calendars/{id}/publish",
      scope: "calendar:publish",
      description:
        "Publish the exact saved calendar draft using its current expectedVersion from calendar_read. Call only when the user asks to publish these changes. The saved audience determines who can see its published activities, and subscribers may receive updates. Activity drafts are not published by this operation.",
      input: calendarTarget,
      output: changed,
      example: { id: exampleId, expectedVersion: 1, confirmed: true },
    },
    async ({ services, principal }, { id, expectedVersion }) => ({
      ...(await services.calendar.calendar(principal.actor, {
        id,
        expectedVersion,
        operation: "publish",
      })),
      reviewUrl,
    }),
  ),
  operation(
    {
      name: "calendar_schedule_publish",
      method: "PATCH",
      path: "/calendar/calendars/{calendarId}/schedules/{id}/publish",
      scope: "calendar:publish",
      description:
        "Publish the exact saved activity draft with its current expectedVersion and owning calendarId from calendar_read. Call only when the user asks to publish these changes. The activity follows its calendar's published audience; subscribers may receive updates. Other drafts remain unchanged.",
      input: calendarTarget.extend({ calendarId: z.uuid() }),
      output: changed,
      example: {
        calendarId: exampleId,
        id: exampleId,
        expectedVersion: 1,
        confirmed: true,
      },
    },
    async ({ services, principal }, { id, calendarId, expectedVersion }) => ({
      ...(await services.calendar.schedule(principal.actor, {
        id,
        calendarId,
        expectedVersion,
        operation: "publish",
      })),
      reviewUrl,
    }),
  ),
  operation(
    {
      name: "calendar_page_publish",
      method: "PATCH",
      path: "/calendar/page/publish",
      scope: "calendar:publish",
      description:
        "Publish the exact saved calendar page design using its current expectedVersion from calendar_read. Call only when the user asks to publish this title, introduction, calendar selection, view and time zone. Calendar and activity drafts are not published by this operation.",
      input: publication,
      output: z.strictObject({
        saved: z.literal(true),
        version,
        reviewUrl: z.literal(reviewUrl),
      }),
      example: { expectedVersion: 1, confirmed: true },
    },
    async ({ services, principal }, { expectedVersion }) => ({
      ...(await services.calendar.page(principal.actor, {
        expectedVersion,
        operation: "publish",
      })),
      reviewUrl,
    }),
  ),
];
