import { z } from "zod";
import { eventModuleKeySchema } from "@/features/events/event_modules";

export const proposedRegistration = z
  .strictObject({
    expectedVersion: z.int().nonnegative(),
    authority: z.enum(["none", "native"]),
    formId: z.uuid().nullable(),
    capacity: z.int().min(1).max(100000).nullable(),
    open: z.boolean(),
  })
  .refine(
    (v) =>
      v.authority === "native" ? Boolean(v.formId) : !v.formId && !v.open,
    "Choose a registration form for native registration; no authority must stay closed.",
  );
export const proposedFeature = z.strictObject({
  expectedVersion: z.int().positive(),
  key: eventModuleKeySchema,
  operation: z.enum(["enable", "disable"]),
  suspendDependents: z.boolean().default(false),
});
export const proposalPayload = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("registration"),
    settings: proposedRegistration,
  }),
  z.strictObject({ kind: z.literal("feature"), settings: proposedFeature }),
]);
export const proposalInput = z.strictObject({
  eventId: z.uuid(),
  requestId: z.uuid(),
  proposal: proposalPayload,
});
export const proposalOutput = z.strictObject({
  id: z.uuid(),
  eventId: z.uuid(),
  eventTitle: z.string(),
  proposal: proposalPayload,
  status: z.enum(["pending", "applied", "rejected"]),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  reviewUrl: z.string(),
});
export type ProposalDto = z.infer<typeof proposalOutput>;
