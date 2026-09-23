import { z } from "zod";
import { cmsLocaleSchema } from "./cms_schemas";
export const publicationScheduleInput = z.strictObject({
  id: z.uuid(),
  locale: cmsLocaleSchema,
  expectedRevisionId: z.uuid(),
  expectedJobId: z.uuid().nullable(),
  requestId: z.uuid(),
  dueAt: z.iso.datetime(),
  confirmed: z.literal(true),
});
export const publicationCancelInput = z.strictObject({
  id: z.uuid(),
  locale: cmsLocaleSchema,
  jobId: z.uuid(),
  confirmed: z.literal(true),
});
export const publicationMessages: Record<string, string> = {
  CANCELLED: "Cancelled by a publisher. Public content was not changed.",
  REPLACED: "Replaced by a newer schedule.",
  CONTENT_CHANGED:
    "The saved draft or publication changed. Review and schedule again.",
  ACCESS_CHANGED:
    "The requesting session, permissions or event feature is no longer available. Sign in and review a new schedule.",
  PUBLICATION_INVALID:
    "Publication checks failed. Review content, referenced media, forms and shared sections before scheduling again.",
  RETRY_PENDING:
    "The runner could not complete publication. A bounded retry is pending.",
  ATTEMPTS_EXHAUSTED:
    "Publication did not complete after three attempts. Review a new schedule.",
};
export type PublicationJobDto = {
  id: string;
  revisionId: string;
  dueAt: string;
  createdAt: string;
  finishedAt: string | null;
  status: "pending" | "processing" | "succeeded" | "cancelled" | "failed";
  attempts: number;
  delayed: boolean;
  message: string | null;
};
export type PublicationScheduleDto = {
  activeId: string | null;
  publishedRevisionId: string | null;
  jobs: PublicationJobDto[];
};
