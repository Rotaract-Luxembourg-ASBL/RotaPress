import { z } from "zod";
import {
  formCreateSchema,
  formSaveSchema,
} from "@/features/forms/form_schemas";
import type { FormDto } from "@/features/forms/form_types";
import {
  eventFields,
  eventFieldsSchema,
  saveEventSchema,
  type EventSummary,
} from "@/features/events/event_schemas";
import {
  partnerProfileSchema,
  partnerSaveSchema,
} from "@/features/partners/partner_schemas";
import { operation, page, pagination } from "./operation";
import {
  calendarOutput,
  directoryOutput,
  eventOutput,
  formOutput,
  mediaOutput,
  pageOutput,
} from "./response_schemas";
import {
  directoryExample,
  eventExample,
  exampleId,
  formExample,
} from "./examples";

const idInput = z.strictObject({ id: z.uuid() });
const formContent = (f: FormDto) => ({
  id: f.id,
  kind: f.kind,
  archived: f.archived,
  draftRevision: f.draftRevision,
  draft: f.draft,
  publishedVersionId: f.publishedVersionId,
});
const eventContent = (e: EventSummary) => ({
  ...eventFields(e),
  id: e.id,
  slug: e.slug,
  version: e.version,
  archived: e.archived,
  cancelled: e.cancelled,
  published: e.published,
});

export const featureOperations = [
  operation(
    {
      name: "media_list",
      output: pageOutput(mediaOutput),
      example: { limit: 20, offset: 0 },
      method: "GET",
      path: "/media",
      scope: "media:read",
      description:
        "List media metadata for native blocks. Private bytes and visibility changes require the administration interface.",
      input: pagination,
    },
    async ({ services: s, principal: p }, i) =>
      page(await s.media.list(p.actor), i),
  ),
  operation(
    {
      name: "forms_list",
      output: pageOutput(formOutput),
      example: { limit: 20, offset: 0 },
      method: "GET",
      path: "/forms",
      scope: "forms:read",
      description:
        "List form definitions. Excludes submissions, response counts, recipients and webhooks.",
      input: pagination,
    },
    async ({ services: s, principal: p }, i) =>
      page((await s.forms.list(p.actor)).map(formContent), i),
  ),
  operation(
    {
      name: "forms_get",
      output: formOutput,
      example: { id: exampleId },
      method: "GET",
      path: "/forms/{id}",
      scope: "forms:read",
      description: "Read a form draft and revision number, without responses.",
      input: idInput,
    },
    async ({ services: s, principal: p }, i) =>
      formContent(await s.forms.detail(p.actor, i.id)),
  ),
  operation(
    {
      name: "forms_create",
      output: formOutput,
      example: { kind: "contact", title: "Contact our club" },
      method: "POST",
      path: "/forms",
      scope: "forms:write",
      description:
        "Create a private contact or membership form draft. Publication remains manual.",
      input: formCreateSchema,
    },
    async ({ services: s, principal: p }, i) =>
      formContent(await s.forms.create(p.actor, i)),
  ),
  operation(
    {
      name: "forms_save",
      output: formOutput,
      example: { id: exampleId, expectedRevision: 1, definition: formExample },
      method: "PATCH",
      path: "/forms/{id}",
      scope: "forms:write",
      description:
        "Save a form draft using its current expectedRevision; no notification or publication changes.",
      input: z.strictObject({ id: z.uuid(), ...formSaveSchema.shape }),
    },
    async ({ services: s, principal: p }, { id, ...i }) =>
      formContent(await s.forms.save(p.actor, id, i)),
  ),
  operation(
    {
      name: "events_list",
      output: pageOutput(eventOutput),
      example: { limit: 20, offset: 0 },
      method: "GET",
      path: "/events",
      scope: "events:read",
      description:
        "List authorized event content without staff identities or guest records.",
      input: pagination,
    },
    async ({ services: s, principal: p }, i) =>
      page((await s.events.list(p.actor)).map(eventContent), i),
  ),
  operation(
    {
      name: "events_get",
      output: eventOutput,
      example: { id: exampleId },
      method: "GET",
      path: "/events/{id}",
      scope: "events:read",
      description:
        "Read authorized event content and draft version, without registrations or guest data.",
      input: idInput,
    },
    async ({ services: s, principal: p }, i) =>
      eventContent(await s.events.detail(p.actor, i.id)),
  ),
  operation(
    {
      name: "events_create",
      output: eventOutput,
      example: eventExample,
      method: "POST",
      path: "/events",
      scope: "events:write",
      description:
        "Create a private event draft managed by the current staff member. Publication and registrations remain separate.",
      input: eventFieldsSchema,
    },
    async ({ services: s, principal: p }, i) =>
      eventContent(
        await s.events.create(p.actor, { ...i, managerUserId: p.actor.userId }),
      ),
  ),
  operation(
    {
      name: "events_save",
      output: eventOutput,
      example: { id: exampleId, expectedVersion: 1, ...eventExample },
      method: "PATCH",
      path: "/events/{id}",
      scope: "events:write",
      description:
        "Save event details to a draft using expectedVersion. Does not publish, change teams or contact guests.",
      input: saveEventSchema,
    },
    async ({ services: s, principal: p }, i) =>
      eventContent(await s.events.save(p.actor, i)),
  ),
  operation(
    {
      name: "directory_list",
      output: pageOutput(directoryOutput),
      example: { limit: 20, offset: 0 },
      method: "GET",
      path: "/directory",
      scope: "directory:read",
      description:
        "List partner, sponsor and team website profiles and draft versions.",
      input: pagination,
    },
    async ({ services: s, principal: p }, i) =>
      page(await s.partners.list(p.actor), i),
  ),
  operation(
    {
      name: "directory_create",
      output: directoryOutput,
      example: directoryExample,
      method: "POST",
      path: "/directory",
      scope: "directory:write",
      description:
        "Create a private website profile draft; no sponsor is contacted.",
      input: partnerProfileSchema,
    },
    async ({ services: s, principal: p }, i) => s.partners.create(p.actor, i),
  ),
  operation(
    {
      name: "directory_save",
      output: directoryOutput,
      example: { id: exampleId, expectedVersion: 1, profile: directoryExample },
      method: "PATCH",
      path: "/directory/{id}",
      scope: "directory:write",
      description:
        "Save a profile draft with expectedVersion. Publication remains manual.",
      input: partnerSaveSchema.extend({ id: z.uuid() }),
    },
    async ({ services: s, principal: p }, { id, ...i }) =>
      s.partners.change(p.actor, id, "save", i),
  ),
  operation(
    {
      name: "calendar_read",
      output: calendarOutput,
      example: {},
      method: "GET",
      path: "/calendar",
      scope: "calendar:read",
      description:
        "Read calendar content and schedules without subscriber addresses or external feed credentials.",
      input: z.strictObject({}),
    },
    async ({ services: s, principal: p }) => s.calendar.workspace(p.actor),
  ),
];
