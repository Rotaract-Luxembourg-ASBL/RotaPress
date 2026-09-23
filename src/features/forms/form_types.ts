import type {
  FormAnswers,
  FormDefinition,
  FormKind,
  FormSettings,
  SubmissionStatus,
} from "./form_schemas";

export type {
  FormAnswers,
  FormDefinition,
  FormField,
  FormKind,
  FormSettings,
  SubmissionFilter,
  SubmissionStatus,
} from "./form_schemas";
export type FormDto = {
  responses?: { total: number; new: number };
  event?: {
    id: string;
    title: string;
    canEdit: boolean;
    canPublish: boolean;
    canReadSubmissions: boolean;
  };
  id: string;
  kind: FormKind;
  archived: boolean;
  draftRevision: number;
  draft: FormDefinition;
  publishedVersionId: string | null;
  publishedVersionNumber: number | null;
  updatedAt: string;
};
export type PublicFormDto = {
  eventId?: string;
  id: string;
  kind: FormKind;
  versionId: string;
  versionNumber: number;
  definition: FormDefinition;
};
export type SubmissionReceipt = {
  id: string;
  receivedAt: string;
  duplicate: boolean;
  membershipStatus: "pending" | "approved" | null;
  message: string;
};
export type SubmissionSummary = {
  id: string;
  formId: string;
  formTitle: string;
  versionNumber: number;
  status: SubmissionStatus;
  receivedAt: string;
  notifications: {
    pending: number;
    processing: number;
    sent: number;
    failed: number;
  };
};
export type SubmissionDto = SubmissionSummary & {
  versionId: string;
  definition: FormDefinition;
  answers: FormAnswers;
  membershipStatus: "pending" | "approved" | null;
  applicant: { name: string; email: string } | null;
  delivery: {
    id: string;
    recipient: string;
    status: "pending" | "processing" | "sent" | "failed";
    attempts: number;
    lastErrorCode: string | null;
    availableAt: string;
    sentAt: string | null;
  }[];
};
export type SubmissionList = {
  submissions: SubmissionSummary[];
  hasMore: boolean;
};
export type RetentionPreview = {
  formId: string;
  retentionDays: number;
  cutoff: string;
  count: number;
  previewToken: string;
};
export type FormSettingsDto = FormSettings;
export type FormDeletionReview = {
  id: string;
  title: string;
  revision: number;
  responses: number;
  versions: number;
  blockedReason: string | null;
};
