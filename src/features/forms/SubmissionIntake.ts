import "server-only";
import { and, eq, sql } from "drizzle-orm";
import {
  formWebhook,
  formWebhookDelivery,
} from "../../../db/schema/form-webhooks";
import {
  form,
  formNotification,
  formSubmission,
} from "../../../db/schema/forms";
import {
  DomainError,
  requireVerifiedActor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { MembershipService } from "../members/MembershipService";
import { FormRepository } from "./FormRepository";
import { SubmissionRepository } from "./SubmissionRepository";
import { submissionHash, validateAnswers } from "./form_answers";
import {
  formDefinitionSchema,
  formSettingsSchema,
  formSubmitSchema,
} from "./form_schemas";
import type { SubmissionReceipt } from "./form_types";

/** Reused by normal submissions and capacity-bound registration in the caller's transaction. */
export class SubmissionIntake {
  private readonly forms: FormRepository;
  private readonly repository: SubmissionRepository;
  constructor(
    db: Database,
    private readonly memberships: MembershipService,
  ) {
    this.forms = new FormRepository(db);
    this.repository = new SubmissionRepository(db);
  }
  async accept(
    actor: TrustedActor | null,
    current: typeof form.$inferSelect,
    input: unknown,
    tx: Transaction,
  ): Promise<SubmissionReceipt> {
    const values = formSubmitSchema.parse(input);
    const organizationId = current.organizationId;
    const formId = current.id;
    const applicant = actor;
    if (applicant) requireVerifiedActor(applicant);
    if (["membership", "registration"].includes(current.kind)) {
      if (!applicant)
        throw new DomainError(
          "VERIFIED_IDENTITY_REQUIRED",
          "Sign in and verify your email before applying.",
          401,
        );
      requireVerifiedActor(applicant);
    }
    const version = await this.forms.version(
      values.versionId,
      formId,
      organizationId,
      tx,
    );
    const definition = formDefinitionSchema.parse(version.definition);
    const answers = validateAnswers(definition, values.answers);
    const hash = submissionHash(version.id, answers, applicant?.userId ?? null);
    const existing = await this.repository.replay(
      formId,
      organizationId,
      values.requestId,
      tx,
    );
    if (existing) {
      if (existing.payloadHash !== hash)
        throw new DomainError(
          "SUBMISSION_REPLAY_CONFLICT",
          "This submission key was already used for a different response. Start a new response.",
          409,
        );
      return receipt(existing, true, definition.successMessage);
    }
    if (current.archived || !current.publishedVersionId)
      throw new DomainError("FORM_NOT_FOUND", "This form is unavailable.", 404);
    if (current.publishedVersionId !== version.id)
      throw new DomainError(
        "FORM_VERSION_CHANGED",
        "This form has changed. Reload it before submitting a new response.",
        409,
      );
    let membershipStatus: "pending" | "approved" | null = null;
    if (applicant && current.kind === "membership") {
      const applied = await this.memberships.applyInTransaction(applicant, tx);
      if (
        !applied ||
        (applied.status !== "pending" && applied.status !== "approved")
      ) {
        throw new DomainError(
          "MEMBERSHIP_APPLICATION_FAILED",
          "The membership application could not be saved.",
          409,
        );
      }
      membershipStatus = applied.status;
    }
    const [submission] = await tx
      .insert(formSubmission)
      .values({
        organizationId,
        formId,
        versionId: version.id,
        requestId: values.requestId,
        payloadHash: hash,
        answers,
        submittedByUserId: applicant?.userId ?? null,
        membershipStatus,
      })
      .returning();
    const settings = formSettingsSchema.parse({
      recipients: current.recipients,
      retentionDays: current.retentionDays,
    });
    if (settings.recipients.length) {
      await tx.insert(formNotification).values(
        settings.recipients.map((recipient) => ({
          organizationId,
          formId,
          submissionId: submission.id,
          recipient,
          reviewedAt: sql`clock_timestamp()`,
        })),
      );
    }
    const [webhook] = await tx
      .select()
      .from(formWebhook)
      .where(
        and(
          eq(formWebhook.formId, formId),
          eq(formWebhook.organizationId, organizationId),
          eq(formWebhook.enabled, true),
        ),
      );
    if (webhook)
      await tx.insert(formWebhookDelivery).values({
        organizationId,
        formId,
        submissionId: submission.id,
        webhookId: webhook.id,
        revision: webhook.revision,
        reviewedAt: sql`clock_timestamp()`,
      });
    return receipt(submission, false, definition.successMessage);
  }
}
function receipt(
  row: typeof formSubmission.$inferSelect,
  duplicate: boolean,
  message: string,
): SubmissionReceipt {
  return {
    id: row.id,
    receivedAt: row.createdAt.toISOString(),
    duplicate,
    membershipStatus: row.membershipStatus,
    message,
  };
}
