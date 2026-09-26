import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import { formPublishSchema } from "@/features/forms/form_schemas";
import { eventVersionSchema } from "@/features/events/event_schemas";
import { partnerPublicationSchema } from "@/features/partners/partner_schemas";
import { operation, type AutomationContext } from "./operation";
import { exampleId } from "./examples";
import { requireScopes } from "./event_preparation";
import { scopeDefinitions } from "./scopes";
import { publicationConfirmation as confirmed } from "./publication_policy";
const versionInput = eventVersionSchema.extend({ confirmed });
const versionReceipt = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  published: z.literal(true),
  reviewUrl: z.string(),
});

async function requirePublication(
  context: AutomationContext,
  scope: "forms:publish" | "events:publish" | "directory:publish",
) {
  requireScopes(context, [scope]);
  const current = await context.services.authorization.require(
    context.principal.actor,
    scopeDefinitions[scope].capability,
  );
  if (current.organizationId !== context.principal.organizationId)
    throw new DomainError(
      "AUTOMATION_ORGANIZATION_CHANGED",
      "Create a connection for the current club.",
      403,
    );
}

export const contentPublicationOperations = [
  operation(
    {
      name: "forms_publish",
      method: "POST",
      path: "/forms/{id}/publish",
      scope: "forms:publish",
      description:
        "Publish the exact saved form revision only when the user asks, with confirmed:true and expectedRevision from forms_get. The current form/event publisher permissions still apply. Does not read responses, change recipients, activate registration or publish its page.",
      input: formPublishSchema.extend({ id: z.uuid(), confirmed }),
      output: z.strictObject({
        id: z.uuid(),
        draftRevision: z.int().positive(),
        publishedVersionId: z.uuid(),
        reviewUrl: z.string(),
      }),
      example: { id: exampleId, expectedRevision: 1, confirmed: true },
    },
    async (context, { id, expectedRevision }) => {
      await requirePublication(context, "forms:publish");
      const form = await context.services.forms.publish(
        context.principal.actor,
        id,
        { expectedRevision },
      );
      return {
        id: form.id,
        draftRevision: form.draftRevision,
        publishedVersionId: form.publishedVersionId,
        reviewUrl: `/admin/forms/${form.id}`,
      };
    },
  ),
  operation(
    {
      name: "events_publish",
      method: "POST",
      path: "/events/{id}/publish",
      scope: "events:publish",
      description:
        "Publish the exact saved event details only when the user asks, with confirmed:true and current expectedVersion. An enabled Website module and already-published Website page are required. Returns their existing blockers; does not automatically publish pages/forms/prizes, enable registration or change provider settings.",
      input: versionInput,
      output: versionReceipt,
      example: { id: exampleId, expectedVersion: 1, confirmed: true },
    },
    async (context, input) => {
      await requirePublication(context, "events:publish");
      const event = await context.services.eventWebsite.publication(
        context.principal.actor,
        {
          ...input,
          operation: "publish",
          pages: [],
        },
      );
      return {
        id: event.id,
        version: event.version,
        published: event.published,
        reviewUrl: `/admin/events/${event.id}`,
      };
    },
  ),
  operation(
    {
      name: "directory_publish",
      method: "POST",
      path: "/directory/{id}/publish",
      scope: "directory:publish",
      description:
        "Publish a saved partner, sponsor or team profile only when the user asks, with confirmed:true and current expectedVersion from directory_list. This can update existing public placements. Images must already be public; image visibility and other profiles remain unchanged.",
      input: partnerPublicationSchema.extend({ id: z.uuid(), confirmed }),
      output: versionReceipt,
      example: { id: exampleId, expectedVersion: 1, confirmed: true },
    },
    async (context, { id, ...input }) => {
      await requirePublication(context, "directory:publish");
      const profile = await context.services.partners.change(
        context.principal.actor,
        id,
        "publish",
        input,
      );
      return {
        id: profile.id,
        version: profile.version,
        published: Boolean(profile.published),
        reviewUrl: "/admin/partners",
      };
    },
  ),
  operation(
    {
      name: "events_prize_publish",
      method: "POST",
      path: "/events/{eventId}/prizes/{id}/publish",
      scope: "events:publish",
      description:
        "Publish a saved editorial prize only when the user asks, with confirmed:true and current expectedVersion from events_prizes. Requires recent sign-in and current event publication authority. Referenced images/donors must already be public. Does not issue entries, change eligibility, run a draw or publish the event/page.",
      input: versionInput.extend({ eventId: z.uuid() }),
      output: versionReceipt.extend({ eventId: z.uuid() }),
      example: {
        eventId: exampleId,
        id: exampleId,
        expectedVersion: 1,
        confirmed: true,
      },
    },
    async (context, { eventId, id, ...input }) => {
      await requirePublication(context, "events:publish");
      const workspace = await context.services.eventPrizes.publication(
        context.principal.actor,
        eventId,
        id,
        { ...input, operation: "publish" },
      );
      const prize = workspace.items.find((item) => item.id === id);
      if (!prize)
        throw new DomainError(
          "PRIZE_NOT_FOUND",
          "This prize is unavailable.",
          404,
        );
      return {
        eventId,
        id: prize.id,
        version: prize.version,
        published: Boolean(prize.published),
        reviewUrl: `/admin/events/${eventId}?tab=prizes`,
      };
    },
  ),
];
