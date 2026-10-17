import { z } from "zod";
import {
  submissionStatuses,
  formKinds,
  type SubmissionStatus,
} from "./form_schemas";

export const inboxFilterSchema = z
  .object({
    q: z.string().trim().max(160).default(""),
    status: z.enum(submissionStatuses).optional(),
    formId: z.uuid().optional(),
    kind: z.enum(formKinds).optional(),
    eventId: z.uuid().optional(),
    after: z.iso.date().optional(),
    before: z.iso.date().optional(),
    page: z.coerce.number().int().min(0).max(1000).default(0),
  })
  .strict()
  .refine(
    (value) => !value.after || !value.before || value.after <= value.before,
    "Choose a valid date range.",
  );

export type InboxMessage = {
  id: string;
  formId: string;
  formTitle: string;
  eventId: string | null;
  eventTitle: string | null;
  kind: string;
  status: SubmissionStatus;
  receivedAt: string;
  name: string;
  email: string | null;
  verified: boolean;
  preview: string;
};
export type InboxPage = {
  total: number;
  counts: Record<SubmissionStatus, number>;
  messages: InboxMessage[];
  hasMore: boolean;
  page: number;
};
export type InboxForm = {
  id: string;
  title: string;
  kind: string;
  eventId: string | null;
  eventTitle: string | null;
  archived: boolean;
};
export const inboxFormQuerySchema = z.strictObject({
  q: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  id: z.uuid().optional(),
});
export type InboxFormPage = {
  forms: InboxForm[];
  page: number;
  pageSize: number;
  total: number;
};
