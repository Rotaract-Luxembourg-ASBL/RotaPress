import { formPublicationOperations } from "./form_publication_operations";
import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import { eventVersionSchema } from "@/features/events/event_schemas";
import { partnerPublicationSchema } from "@/features/partners/partner_schemas";
import { receiptOperation } from "./receipt_operation";
import {
  requireReceiptCapability,
  requireReceiptEvent,
} from "./receipt_authority";
import { exampleId } from "./examples";
import { publicationConfirmation as confirmed } from "./publication_policy";
const versionInput = eventVersionSchema.extend({ confirmed });
const versionReceipt = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  published: z.literal(true),
  reviewUrl: z.string(),
});

export const contentPublicationOperations = [
  ...formPublicationOperations,
  receiptOperation(
    {
      name: "events_publish",
      effect: "publish",
      method: "POST",
      path: "/events/{id}/publish",
      scope: "events:publish",
      description:
        "Publish the exact saved event details only when the user asks, with confirmed:true and current expectedVersion. An enabled Website module and already-published Website page are required. Returns their existing blockers; does not automatically publish pages/forms/prizes, enable registration or change provider settings.",
      input: versionInput,
      output: versionReceipt,
      example: { id: exampleId, expectedVersion: 1, confirmed: true },
    },
    (context, input, tx) =>
      requireReceiptEvent(context, input.id, "events.publish", tx),
    async (context, input, tx) => {
      const event = await context.services.eventWebsite.publication(
        context.principal.actor,
        {
          ...input,
          operation: "publish",
          pages: [],
        },
        tx,
      );
      return {
        id: event.id,
        version: event.version,
        published: event.published,
        reviewUrl: `/admin/events/${event.id}`,
      };
    },
  ),
  receiptOperation(
    {
      name: "directory_publish",
      effect: "publish",
      method: "POST",
      path: "/directory/{id}/publish",
      scope: "directory:publish",
      description:
        "Publish a saved partner, sponsor or team profile only when the user asks, with confirmed:true and current expectedVersion from directory_list. This can update existing public placements. Images must already be public; image visibility and other profiles remain unchanged.",
      input: partnerPublicationSchema.extend({ id: z.uuid(), confirmed }),
      output: versionReceipt,
      example: { id: exampleId, expectedVersion: 1, confirmed: true },
    },
    requireReceiptCapability("cms.publish"),
    async (context, { id, ...input }, tx) => {
      const profile = await context.services.partners.change(
        context.principal.actor,
        id,
        "publish",
        input,
        tx,
      );
      return {
        id: profile.id,
        version: profile.version,
        published: Boolean(profile.published),
        reviewUrl: "/admin/partners",
      };
    },
  ),
  receiptOperation(
    {
      name: "events_prize_publish",
      effect: "publish",
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
    (context, input, tx) =>
      requireReceiptEvent(context, input.eventId, "events.publish", tx, true),
    async (context, { eventId, id, ...input }, tx) => {
      const workspace = await context.services.eventPrizes.publication(
        context.principal.actor,
        eventId,
        id,
        { ...input, operation: "publish" },
        tx,
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
