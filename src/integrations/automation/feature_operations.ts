import { formContentOperations } from "./form_content_operations";
import { z } from "zod";
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
import { operation, pagination, pageMetadata } from "./operation";
import { receiptOperation } from "./receipt_operation";
import {
  requireReceiptCapability,
  requireReceiptEvent,
} from "./receipt_authority";
import { mediaAdminListSchema } from "@/features/media/media_schemas";
import {
  calendarOutput,
  directoryOutput,
  directoryMutationOutput,
  eventOutput,
  mediaOutput,
  pageOutput,
} from "./response_schemas";
import { directoryExample, eventExample, exampleId } from "./examples";

const idInput = z.strictObject({ id: z.uuid() });
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
  ...formContentOperations,
  operation(
    {
      name: "media_list",
      effect: "read",
      output: pageOutput(mediaOutput),
      example: { limit: 20, offset: 0 },
      method: "GET",
      path: "/media",
      scope: "media:read",
      description:
        "List media metadata for native blocks with authorized pagination. Use media_inspect with its separate scope to read image pixels. Automation uploads are private; media_publish requires its separate grant and an explicit request. Optional media:manage permits requested metadata, organization, hiding and deletion with native reference protections.",
      input: pagination.extend({
        search: mediaAdminListSchema.shape.search,
        visibility: mediaAdminListSchema.shape.visibility,
        collection: mediaAdminListSchema.shape.collection,
        dateFrom: mediaAdminListSchema.shape.dateFrom,
        dateTo: mediaAdminListSchema.shape.dateTo,
        sort: mediaAdminListSchema.shape.sort,
      }),
    },
    async ({ services: s, principal: p }, { limit, offset, ...filters }) => {
      const result = await s.media.adminList(p.actor, {
        ...filters,
        kind: "image",
        pageSize: limit,
        offset,
      });
      return {
        items: result.assets.map((asset) => mediaOutput.strip().parse(asset)),
        ...pageMetadata(result.total, { offset, limit }),
      };
    },
  ),
  operation(
    {
      name: "events_list",
      effect: "read",
      output: pageOutput(eventOutput),
      example: { limit: 20, offset: 0 },
      method: "GET",
      path: "/events",
      scope: "events:read",
      description:
        "List authorized event content without staff identities or guest records.",
      input: pagination,
    },
    async ({ services: s, principal: p }, { offset, limit }) => {
      const result = await s.events.query(p.actor, {
        offset,
        pageSize: limit,
        status: "all",
      });
      return {
        items: result.events.map(eventContent),
        ...pageMetadata(result.total, { offset, limit }),
      };
    },
  ),
  operation(
    {
      name: "events_get",
      effect: "read",
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
  receiptOperation(
    {
      name: "events_create",
      effect: "draft",
      output: eventOutput,
      example: eventExample,
      method: "POST",
      path: "/events",
      scope: "events:write",
      description:
        "Create a private event draft managed by the current staff member. Publication and registrations remain separate.",
      input: eventFieldsSchema,
    },
    requireReceiptCapability("events.create"),
    async ({ services: s, principal: p }, i, tx) =>
      eventContent(
        await s.events.create(
          p.actor,
          { ...i, managerUserId: p.actor.userId },
          tx,
        ),
      ),
  ),
  receiptOperation(
    {
      name: "events_save",
      effect: "draft",
      output: eventOutput,
      example: { id: exampleId, expectedVersion: 1, ...eventExample },
      method: "PATCH",
      path: "/events/{id}",
      scope: "events:write",
      description:
        "Save event details to a draft using expectedVersion. Does not publish, change teams or contact guests.",
      input: saveEventSchema,
    },
    (context, input, tx) =>
      requireReceiptEvent(context, input.id, "events.edit", tx),
    async ({ services: s, principal: p }, i, tx) =>
      eventContent(await s.events.save(p.actor, i, tx)),
  ),
  operation(
    {
      name: "directory_list",
      effect: "read",
      output: pageOutput(directoryOutput),
      example: { limit: 20, offset: 0 },
      method: "GET",
      path: "/directory",
      scope: "directory:read",
      description:
        "List partner, sponsor and team website profiles and draft versions.",
      input: pagination,
    },
    async ({ services: s, principal: p }, { offset, limit }) => {
      const result = await s.partners.query(p.actor, {
        offset,
        pageSize: limit,
      });
      return {
        items: result.items,
        ...pageMetadata(result.total, { offset, limit }),
      };
    },
  ),
  receiptOperation(
    {
      name: "directory_create",
      effect: "draft",
      output: directoryMutationOutput,
      example: directoryExample,
      method: "POST",
      path: "/directory",
      scope: "directory:write",
      description:
        "Create a private website profile draft; no sponsor is contacted.",
      input: partnerProfileSchema,
    },
    requireReceiptCapability("cms.edit"),
    async ({ services: s, principal: p }, i, tx) =>
      directoryMutationOutput
        .strip()
        .parse(await s.partners.create(p.actor, i, tx)),
  ),
  receiptOperation(
    {
      name: "directory_save",
      effect: "draft",
      output: directoryMutationOutput,
      example: { id: exampleId, expectedVersion: 1, profile: directoryExample },
      method: "PATCH",
      path: "/directory/{id}",
      scope: "directory:write",
      description:
        "Save a profile draft with expectedVersion. Publishing requires the separate directory:publish grant and an explicit user request.",
      input: partnerSaveSchema.extend({ id: z.uuid() }),
    },
    requireReceiptCapability("cms.edit"),
    async ({ services: s, principal: p }, { id, ...i }, tx) =>
      directoryMutationOutput
        .strip()
        .parse(await s.partners.change(p.actor, id, "save", i, tx)),
  ),
  operation(
    {
      name: "calendar_read",
      effect: "read",
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
