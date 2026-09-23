import { z } from "zod";
import type { PurchaseOrder, PurchaseView } from "../guests/purchase_schemas";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        [...value].every(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      "Use a single line without control characters.",
    );
const quantity = z.number().int().min(1).max(10000);
const reason = z
  .string()
  .trim()
  .min(5, "Explain your decision in at least 5 characters.")
  .max(1000);
const base = { mode: z.literal("demo"), requestId: z.uuid(), quantity, reason };
export const createEntrySchema = z.discriminatedUnion("source", [
  z.strictObject({
    ...base,
    source: z.literal("manual"),
    label: text(100),
    reference: text(240),
  }),
  z.strictObject({
    ...base,
    source: z.literal("purchase"),
    guestId: z.uuid(),
    reference: text(240),
    expectedEvidenceKey: z.string().length(64),
  }),
]);
export const reviewEntrySchema = z.strictObject({
  ...base,
  expectedVersion: z.number().int().positive(),
  expectedEvidenceKey: z.string().length(64),
  decision: z.enum(["approve", "hold", "void"]),
});
export type CreateEntry = z.infer<typeof createEntrySchema>;
export type ReviewEntry = z.infer<typeof reviewEntrySchema>;

export type EntryPurchaseEvidence = {
  guestId: string;
  label: string;
  approved: boolean;
  receiptId: string | null;
  version: number;
  mode: PurchaseView["mode"];
  status: PurchaseView["status"];
  orders: PurchaseOrder[];
};
export type EntryEvidence = {
  key: string;
  receiptId: string | null;
  order: PurchaseOrder | null;
  issue: string | null;
};
export type EntryReview = {
  actorName: string;
  version: number;
  quantity: number;
  decision: "approve" | "hold" | "void";
  reason: string;
  createdAt: string;
};
export type EntryRecord = {
  id: string;
  label: string;
  reference: string;
  source: "manual" | "purchase";
  guestId: string | null;
  state: "ready" | "held" | "void";
  holdReason: string | null;
  quantity: number;
  version: number;
  evidence: EntryEvidence;
  history: EntryReview[];
};
export type EntryWorkspace = {
  mode: "demo";
  canManage: boolean;
  unavailableReason: string | null;
  entries: EntryRecord[];
};
export type EntryBooking = { id: string; label: string };
export type EntryBookingOrders = {
  label: string;
  orders: { reference: string; evidence: EntryEvidence }[];
};
