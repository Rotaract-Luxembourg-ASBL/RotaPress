import { z } from "zod";

export const purchaseRefreshSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    requestId: z.uuid(),
    confirmed: z.literal(true),
  })
  .strict();

export type PurchaseOrder = {
  reference: string;
  amount: number;
  discount: number;
  tax: number;
  currency: string | null;
  captured: boolean;
  refunded: number;
  state: "free" | "uncaptured" | "captured" | "partly_refunded" | "refunded";
};
export type PurchaseView = {
  version: number;
  mode: "blocked" | "fixture" | "live";
  status: "never" | "running" | "failed" | "observed" | "stale";
  observedAt: string | null;
  attemptedAt: string | null;
  receiptId: string | null;
  orders: PurchaseOrder[];
  tickets: {
    name: string;
    amount: number;
    discount: number;
    tax: number;
    currency: string | null;
    captured: boolean;
  }[];
  receiptUrl: string | null;
  refreshAllowed: boolean;
};
