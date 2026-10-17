import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import {
  eventEditorChangeSchema,
  eventManagerChangeSchema,
  eventVersionSchema,
  type EventCapability,
} from "@/features/events/event_schemas";
import { registrationSettingsSchema } from "@/features/events/registration_schemas";
import { eventModuleKeySchema } from "@/features/events/event_modules";
import { guestCollectionSchema } from "@/features/guests/guest_collection";
import {
  grantGuestSchema,
  revokeGuestSchema,
} from "@/features/guests/guest_schemas";
import type { Transaction } from "@/core/authorization/AuthorizationService";
import { operation, type AutomationContext } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { exampleId } from "./examples";

const eventState = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
});
const registration = z.strictObject({
  id: z.uuid(),
  eventId: z.uuid(),
  eventTitle: z.string(),
  status: z.enum(["confirmed", "cancelled"]),
  createdAt: z.iso.datetime(),
  cancelledAt: z.iso.datetime().nullable(),
});
const registrationSettings = z.strictObject({
  authority: z.enum(["none", "native", "luma"]),
  formId: z.uuid().nullable(),
  capacity: z.int().positive().nullable(),
  open: z.boolean(),
  version: z.int().nonnegative(),
  confirmedCount: z.int().nonnegative(),
  externalLocked: z.boolean(),
});
const guestCandidate = z.strictObject({
  id: z.uuid(),
  source: z.enum(["native", "luma"]),
  name: z.string(),
  email: z.string(),
  status: z.string(),
  validEmail: z.boolean(),
});
const guestGrant = z.strictObject({
  id: z.uuid(),
  source: z.enum(["native", "luma"]),
  name: z.string(),
  email: z.email(),
  status: z.enum(["invited", "claimed", "revoked"]),
  version: z.int().positive(),
  available: z.boolean(),
});
const idResult = z.strictObject({ id: z.uuid() });
const eventInput = z.strictObject({ eventId: z.uuid() });
const pagination = z.strictObject({
  total: z.int().nonnegative(),
  page: z.int().positive(),
  pageSize: z.int().positive(),
});

async function eventAuthority(
  context: AutomationContext,
  id: string,
  capability: EventCapability,
  tx: Transaction,
  recent = false,
) {
  if (recent)
    context.services.authorization.requireRecent(context.principal.actor);
  const event = await context.services.events.detail(
    context.principal.actor,
    id,
    tx,
  );
  context.services.events.requireCapability(event, capability);
}

export const operationalEventOperations = [
  operation(
    {
      name: "registrations_list",
      method: "GET",
      path: "/events/{eventId}/registrations",
      scope: "registrations:read",
      effect: "read",
      description:
        "Search and paginate authorized event registration names, email, status and response references.",
      input: eventInput.extend({
        page: z.int().positive().default(1),
        pageSize: z.int().min(1).max(100).default(25),
        search: z.string().max(200).default(""),
        status: z.enum(["all", "confirmed", "cancelled"]).default("all"),
      }),
      output: pagination.extend({
        items: z.array(
          registration.extend({
            name: z.string(),
            email: z.email(),
            formId: z.uuid(),
            submissionId: z.uuid(),
          }),
        ),
      }),
      example: { eventId: exampleId },
    },
    async ({ services, principal }, { eventId, ...query }) =>
      services.registrations.query(principal.actor, eventId, query),
  ),
  operation(
    {
      name: "registrations_cancel",
      method: "POST",
      path: "/events/{eventId}/registrations/{id}/cancel",
      scope: "registrations:manage",
      effect: "update",
      description:
        "Cancel the exact requested native booking and release its place. Booking and answer history remain retained; this never issues a provider refund.",
      input: eventInput.extend({
        id: z.uuid(),
        confirmed: z.literal(true),
        ...receiptFields,
      }),
      output: registration,
      example: {
        eventId: exampleId,
        id: exampleId,
        confirmed: true,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "registrations_cancel",
        input,
        registration,
        (tx) =>
          eventAuthority(context, input.eventId, "events.responses.manage", tx),
        (tx) =>
          context.services.registrations.cancel(
            context.principal.actor,
            input.id,
            { confirmed: true },
            input.eventId,
            tx,
          ),
      ),
  ),
  operation(
    {
      name: "events_registration_get",
      method: "GET",
      path: "/events/{eventId}/registration",
      scope: "events:operate",
      effect: "read",
      description:
        "Read registration authority, open state, capacity and exact settings version before a requested operational change.",
      input: eventInput,
      output: registrationSettings,
      example: { eventId: exampleId },
    },
    ({ services, principal }, { eventId }) =>
      services.registrations.workspace(principal.actor, eventId),
  ),
  operation(
    {
      name: "events_registration_set",
      method: "POST",
      path: "/events/{eventId}/registration",
      scope: "events:operate",
      effect: "update",
      description:
        "Apply the user's requested registration settings directly. Opening registration has an immediate effect. Uses current settings version and existing event/publication authority; external provider authority cannot be overwritten.",
      input: registrationSettingsSchema.safeExtend({
        eventId: z.uuid(),
        ...receiptFields,
      }),
      output: registrationSettings,
      example: {
        eventId: exampleId,
        requestId: exampleId,
        expectedVersion: 1,
        authority: "none",
        formId: null,
        capacity: null,
        open: false,
        confirmed: true,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "events_registration_set",
        input,
        registrationSettings,
        (tx) =>
          eventAuthority(context, input.eventId, "events.publish", tx, true),
        (tx) =>
          context.services.registrations.configure(
            context.principal.actor,
            input.eventId,
            {
              expectedVersion: input.expectedVersion,
              authority: input.authority,
              formId: input.formId,
              capacity: input.capacity,
              open: input.open,
              confirmed: true,
            },
            tx,
          ),
      ),
  ),
  operation(
    {
      name: "events_module_set",
      method: "POST",
      path: "/events/{id}/features",
      scope: "events:operate",
      effect: "update",
      description:
        "Apply the exact requested event feature change directly, preserving dependency and operational checks. Does not enable global integrations or payment providers.",
      input: eventVersionSchema.extend({
        key: eventModuleKeySchema,
        operation: z.enum(["enable", "disable"]),
        suspendDependents: z.boolean().default(false),
        confirmed: z.literal(true),
        ...receiptFields,
      }),
      output: eventState,
      example: {
        id: exampleId,
        expectedVersion: 1,
        key: "gallery",
        operation: "enable",
        confirmed: true,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "events_module_set",
        input,
        eventState,
        (tx) =>
          eventAuthority(context, input.id, "events.modules.manage", tx, true),
        async (tx) => {
          const event = await context.services.eventModules.change(
            context.principal.actor,
            {
              id: input.id,
              expectedVersion: input.expectedVersion,
              key: input.key,
              operation: input.operation,
              suspendDependents: input.suspendDependents,
              confirmed: true,
            },
            tx,
          );
          return { id: event.id, version: event.version };
        },
      ),
  ),
  operation(
    {
      name: "events_cancellation_preview",
      method: "GET",
      path: "/events/{eventId}/cancellation",
      scope: "events:manage",
      effect: "read",
      description:
        "Read the exact current event cancellation impact and confirmed booking count. A preview is not an extra approval gate.",
      input: eventInput,
      output: z.strictObject({
        expectedVersion: z.int().positive(),
        expectedConfirmed: z.int().nonnegative(),
        cancelled: z.boolean(),
        externalAuthority: z.boolean(),
      }),
      example: { eventId: exampleId },
    },
    ({ services, principal }, { eventId }) =>
      services.eventCancellation.preview(principal.actor, eventId),
  ),
  operation(
    {
      name: "events_cancel",
      method: "POST",
      path: "/events/{id}/cancel",
      scope: "events:manage",
      effect: "update",
      description:
        "Cancel the specifically requested event and its native registrations using current version and expected booking count. Retains history and does not issue refunds or cancel external provider events.",
      input: eventVersionSchema.extend({
        expectedConfirmed: z.int().nonnegative(),
        confirmed: z.literal(true),
        ...receiptFields,
      }),
      output: eventState,
      example: {
        id: exampleId,
        expectedVersion: 1,
        expectedConfirmed: 0,
        confirmed: true,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "events_cancel",
        input,
        eventState,
        (tx) => eventAuthority(context, input.id, "events.cancel", tx, true),
        async (tx) => {
          const event = await context.services.eventCancellation.cancel(
            context.principal.actor,
            {
              id: input.id,
              expectedVersion: input.expectedVersion,
              expectedConfirmed: input.expectedConfirmed,
              confirmed: true,
            },
            tx,
          );
          return { id: event.id, version: event.version };
        },
      ),
  ),
  operation(
    {
      name: "events_archive",
      method: "POST",
      path: "/events/{id}/archive",
      scope: "events:manage",
      effect: "archive",
      description:
        "Archive the exact requested event using its current version. History remains retained. Does not cancel or refund an external event.",
      input: eventVersionSchema.extend(receiptFields),
      output: eventState,
      example: { id: exampleId, expectedVersion: 1, requestId: exampleId },
    },
    (context, input) =>
      executeReceipt(
        context,
        "events_archive",
        input,
        eventState,
        (tx) => eventAuthority(context, input.id, "events.archive", tx, true),
        async (tx) => {
          const event = await context.services.events.archive(
            context.principal.actor,
            { id: input.id, expectedVersion: input.expectedVersion },
            tx,
          );
          return { id: event.id, version: event.version };
        },
      ),
  ),
  operation(
    {
      name: "guests_list",
      method: "GET",
      path: "/events/{eventId}/guests",
      scope: "guests:read",
      effect: "read",
      description:
        "Search and paginate private guest candidates and grants for one authorized event. Provider/internal source labels are excluded; invalid source addresses are visible but cannot receive access.",
      input: guestCollectionSchema.extend({ eventId: z.uuid() }).strict(),
      output: z.strictObject({
        candidates: z.array(guestCandidate),
        grants: z.array(guestGrant),
        pagination,
        candidatePagination: pagination,
      }),
      example: { eventId: exampleId },
    },
    async ({ services, principal }, { eventId, ...query }) => {
      const result = await services.guests.workspace(
        principal.actor,
        eventId,
        query,
      );
      return {
        candidates: result.candidates.map((entry) =>
          guestCandidate.strip().parse(entry),
        ),
        grants: result.grants.map((entry) => guestGrant.strip().parse(entry)),
        pagination: result.pagination,
        candidatePagination: result.candidatePagination,
      };
    },
  ),
  operation(
    {
      name: "guests_grant",
      method: "POST",
      path: "/events/{eventId}/guests",
      scope: "guests:access",
      effect: "access",
      description:
        "Grant requested guest-portal access from an existing confirmed registration or current provider guest. Exact source identity/email is rechecked; no login or membership bypass and no email is sent by this action.",
      input: grantGuestSchema.extend({
        eventId: z.uuid(),
        expectedEmail: z.email(),
        ...receiptFields,
      }),
      output: idResult,
      example: {
        eventId: exampleId,
        source: "native",
        sourceId: exampleId,
        expectedEmail: "guest@example.org",
        confirmed: true,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "guests_grant",
        input,
        idResult,
        (tx) =>
          eventAuthority(
            context,
            input.eventId,
            "events.guests.manage",
            tx,
            true,
          ),
        (tx) =>
          context.services.guests.grant(
            context.principal.actor,
            input.eventId,
            {
              source: input.source,
              sourceId: input.sourceId,
              expectedEmail: input.expectedEmail,
              confirmed: true,
            },
            tx,
          ),
      ),
  ),
  operation(
    {
      name: "guests_revoke",
      method: "POST",
      path: "/events/{eventId}/guests/{id}/revoke",
      scope: "guests:access",
      effect: "access",
      description:
        "Revoke exactly the requested guest grant using its current version. Does not cancel a booking or change membership.",
      input: revokeGuestSchema.extend({
        id: z.uuid(),
        eventId: z.uuid(),
        ...receiptFields,
      }),
      output: idResult,
      example: {
        eventId: exampleId,
        id: exampleId,
        expectedVersion: 1,
        confirmed: true,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "guests_revoke",
        input,
        idResult,
        (tx) =>
          eventAuthority(
            context,
            input.eventId,
            "events.guests.manage",
            tx,
            true,
          ),
        (tx) =>
          context.services.guests.revoke(
            context.principal.actor,
            input.eventId,
            input.id,
            { expectedVersion: input.expectedVersion, confirmed: true },
            tx,
          ),
      ),
  ),
  operation(
    {
      name: "events_team_set",
      method: "POST",
      path: "/events/{id}/team",
      scope: "access:roles",
      effect: "access",
      description:
        "Grant or revoke the requested event editor/registration-manager role with current event version. Cannot change the assistant account's own access or replace the manager.",
      input: eventEditorChangeSchema.extend(receiptFields),
      output: eventState,
      example: {
        id: exampleId,
        expectedVersion: 1,
        userId: "reviewed-member-id",
        operation: "grant",
        role: "editor",
        confirmed: true,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "events_team_set",
        input,
        eventState,
        async (tx) => {
          if (input.userId === context.principal.actor.userId)
            throw new DomainError(
              "AUTOMATION_SELF_ACCESS",
              "An assistant cannot change its own access.",
              403,
            );
          await eventAuthority(
            context,
            input.id,
            "events.team.manage",
            tx,
            true,
          );
        },
        async (tx) => {
          const event = await context.services.events.changeEditor(
            context.principal.actor,
            {
              id: input.id,
              expectedVersion: input.expectedVersion,
              userId: input.userId,
              operation: input.operation,
              role: input.role,
              confirmed: true,
            },
            tx,
          );
          return { id: event.id, version: event.version };
        },
      ),
  ),
  operation(
    {
      name: "events_manager_set",
      method: "POST",
      path: "/events/{id}/manager",
      scope: "access:roles",
      effect: "access",
      description:
        "Assign the explicitly requested responsible event manager. Requires current global event-management authority, recent identity and current event version; cannot grant the assistant account new access.",
      input: eventManagerChangeSchema.extend(receiptFields),
      output: eventState,
      example: {
        id: exampleId,
        expectedVersion: 1,
        managerUserId: "reviewed-member-id",
        confirmed: true,
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "events_manager_set",
        input,
        eventState,
        async (tx) => {
          if (input.managerUserId === context.principal.actor.userId)
            throw new DomainError(
              "AUTOMATION_SELF_ACCESS",
              "An assistant cannot change its own access.",
              403,
            );
          context.services.authorization.requireRecent(context.principal.actor);
          await context.services.authorization.require(
            context.principal.actor,
            "events.manage",
            tx,
          );
        },
        async (tx) => {
          const event = await context.services.events.reassignManager(
            context.principal.actor,
            {
              id: input.id,
              expectedVersion: input.expectedVersion,
              managerUserId: input.managerUserId,
              confirmed: true,
            },
            tx,
          );
          return { id: event.id, version: event.version };
        },
      ),
  ),
];
