import { z } from "zod";
import type { ConnectionMode } from "./connection_schemas";
import { lumaEventUrlSchema } from "./luma_schemas";
import type { ReconciliationJobDto } from "./job_schemas";
import type { PackageSource } from "../../features/events/package_schemas";

export const providerEventIdSchema = z
  .string()
  .regex(
    /^evt-[A-Za-z0-9_-]{1,100}$/,
    "Enter a Luma event ID beginning with evt-.",
  );
export const apiLinkSchema = z
  .object({
    sourceId: z.uuid().optional(),
    expectedVersion: z.number().int().nonnegative(),
    providerEventId: providerEventIdSchema,
    confirmed: z.literal(true),
  })
  .strict();
export const syncToggleSchema = z
  .object({
    sourceId: z.uuid().optional(),
    expectedVersion: z.number().int().positive(),
    enabled: z.boolean(),
    confirmed: z.literal(true),
  })
  .strict();
export const syncRequestSchema = z
  .object({
    sourceId: z.uuid().optional(),
    expectedVersion: z.number().int().positive(),
    requestId: z.uuid(),
    confirmed: z.literal(true),
  })
  .strict();
export const providerEventSchema = z.object({
  id: providerEventIdSchema,
  calendar_id: z.string().min(1).max(120),
  access: z.literal("manage"),
  url: lumaEventUrlSchema,
});
export const providerGuestSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
    user_email: z.email().max(254),
    user_name: z.string().max(200).nullable(),
    approval_status: z.enum([
      "approved",
      "session",
      "pending_approval",
      "invited",
      "declined",
      "waitlist",
    ]),
    event_tickets: z
      .array(z.object({ id: z.string().min(1).max(120) }))
      .max(200),
  })
  .transform((v) => ({
    providerGuestId: v.id,
    email: v.user_email,
    name: v.user_name,
    approvalStatus: v.approval_status,
    ticketCount: v.event_tickets.length,
  }));
export const providerGuestPageSchema = z.object({
  entries: z.array(providerGuestSchema).max(100),
  has_more: z.boolean(),
  next_cursor: z.string().min(1).max(1024).optional(),
});
export type ImportedGuest = z.output<typeof providerGuestSchema>;
export const syncMessages = {
  SYNC_INTERRUPTED:
    "The previous reconciliation was interrupted. Retained records are unchanged; start a new reconciliation.",
  SYNC_FAILED:
    "Reconciliation failed. The last complete guest projection is retained.",
  SYNC_LIMIT:
    "This event exceeds the current reconciliation limit. No guest projection was changed.",
  EVENT_MISMATCH:
    "The API event must be manageable in the selected calendar and match the selected booking source.",
  SYNC_UNAVAILABLE:
    "Reconciliation is unavailable. Review the event, registration feature and club connection.",
} as const;
export type SyncRunDto = {
  id: string;
  status: "running" | "succeeded" | "failed" | "interrupted";
  startedAt: string;
  finishedAt: string | null;
  guestCount: number | null;
  message: string | null;
};
export type LumaSyncDto = {
  sourceId: string | null;
  sources: PackageSource[];
  jobs?: ReconciliationJobDto[];
  version: number;
  providerEventId: string | null;
  enabled: boolean;
  available: boolean;
  reason: string | null;
  canConfigure: boolean;
  mode: ConnectionMode;
  lastSuccessAt: string | null;
  count: number;
  runs: SyncRunDto[];
  guests: (ImportedGuest & {
    id: string;
    present: boolean;
    observedAt: string;
  })[];
};
