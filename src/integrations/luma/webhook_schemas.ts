import { z } from "zod";

export const webhookEventTypes = [
  "event.created",
  "event.updated",
  "event.canceled",
  "guest.registered",
  "guest.updated",
  "guest.refunded",
] as const;
export const webhookEventLabels: Record<
  (typeof webhookEventTypes)[number],
  string
> = {
  "event.created": "Event created",
  "event.updated": "Event updated",
  "event.canceled": "Event cancelled",
  "guest.registered": "Guest registered",
  "guest.updated": "Guest updated",
  "guest.refunded": "Guest refunded",
};
export const webhookActionSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  })
  .strict();
export const webhookSaveSchema = webhookActionSchema.extend({
  // Luma generates the signing secret. It is distinct from the calendar API key.
  secret: z
    .string()
    .regex(/^whsec_[\x21-\x7e]{16,240}$/)
    .optional(),
  eventTypes: z
    .array(z.enum(webhookEventTypes))
    .min(1)
    .max(webhookEventTypes.length)
    .refine(
      (types) => new Set(types).size === types.length,
      "Choose each event type once.",
    ),
});
export type LumaWebhookDto = {
  version: number;
  callbackUrl: string | null;
  hasSecret: boolean;
  enabled: boolean;
  allowed: boolean;
  encryptionReady: boolean;
  localOnly: boolean;
  eventTypes: (typeof webhookEventTypes)[number][];
  receipts: {
    id: string;
    eventType: (typeof webhookEventTypes)[number];
    receivedAt: string;
    eventId: string | null;
    sourceId: string | null;
    sourceLabel: string | null;
  }[];
};
