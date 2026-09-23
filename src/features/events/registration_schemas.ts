import { z } from "zod";
export const registrationSettingsSchema = z
  .strictObject({
    expectedVersion: z.number().int().nonnegative(),
    authority: z.enum(["none", "native"]),
    formId: z.uuid().nullable(),
    capacity: z.number().int().min(1).max(100000).nullable(),
    open: z.boolean(),
    confirmed: z.literal(true),
  })
  .refine(
    (v) =>
      v.authority === "native" ? Boolean(v.formId) : !v.formId && !v.open,
    "Choose a registration form for native registration; no authority must stay closed.",
  );
export const cancellationSchema = z.strictObject({
  confirmed: z.literal(true),
});
export type RegistrationSettingsDto = {
  authority: "none" | "native" | "luma";
  formId: string | null;
  capacity: number | null;
  open: boolean;
  version: number;
  confirmedCount: number;
  externalLocked: boolean;
};
export type RegistrationDto = {
  id: string;
  eventId: string;
  eventTitle: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
  cancelledAt: string | null;
};
