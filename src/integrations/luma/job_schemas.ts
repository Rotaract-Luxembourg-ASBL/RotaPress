import { z } from "zod";

export const cancelReconciliationSchema = z
  .object({
    id: z.uuid(),
    sourceId: z.uuid().optional(),
    confirmed: z.literal(true),
  })
  .strict();
export const reconciliationMessages: Record<string, string> = {
  CANCELLED: "Cancelled. The last complete guest projection is retained.",
  ACCESS_CHANGED:
    "The requesting session or event access changed. Review access before requesting another reconciliation.",
  CONFIGURATION_CHANGED:
    "Event, registration or connection settings changed. Review the current configuration before requesting another reconciliation.",
  RETRY_PENDING:
    "The provider request could not complete. A bounded retry is queued; existing records are retained.",
  ATTEMPTS_EXHAUSTED:
    "Three attempts were used. Existing records are retained; review the connection before requesting another reconciliation.",
  PROVIDER_REJECTED:
    "The provider response could not be accepted. Review the connection and linked event; existing records are retained.",
};
export type ReconciliationJobDto = {
  id: string;
  sourceId: string;
  status: "pending" | "processing" | "succeeded" | "cancelled" | "failed";
  attempts: number;
  createdAt: string;
  availableAt: string;
  finishedAt: string | null;
  message: string | null;
};
