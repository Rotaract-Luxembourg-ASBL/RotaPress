import "server-only";
import { isContentElement } from "./form_elements";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { formNotification, formSubmission } from "../../../db/schema/forms";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { MembershipService } from "../members/MembershipService";
import { FormScopePolicy } from "./FormScopePolicy";
import { SubmissionIntake } from "./SubmissionIntake";
import { FormRepository } from "./FormRepository";
import { SubmissionRepository } from "./SubmissionRepository";
import { csvCell } from "./form_answers";
import {
  formDefinitionSchema,
  formSettingsSchema,
  formSubmitSchema,
  retentionDeleteSchema,
  submissionDeleteSchema,
  submissionFilterSchema,
  submissionStatusSchema,
} from "./form_schemas";
import type {
  RetentionPreview,
  SubmissionDto,
  SubmissionList,
  SubmissionReceipt,
} from "./form_types";

export class SubmissionService {
  private readonly scope: FormScopePolicy;
  private readonly intake: SubmissionIntake;
  private readonly forms: FormRepository;
  private readonly repository: SubmissionRepository;
  private readonly audit = new AuditRepository();

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    memberships: MembershipService,
  ) {
    this.forms = new FormRepository(db);
    this.scope = new FormScopePolicy(db, authorization);
    this.intake = new SubmissionIntake(db, memberships);
    this.repository = new SubmissionRepository(db);
  }

  async submit(
    actor: TrustedActor | null,
    formId: string,
    input: unknown,
  ): Promise<SubmissionReceipt> {
    z.uuid().parse(formId);
    const values = formSubmitSchema.parse(input);
    return this.db.transaction(async (tx) => {
      // Shares the publication/settings/membership lock. An accepted response and
      // its pending application/notifications either all commit or all roll back.
      const organizationId = await this.forms.lockInstalled(tx);
      const current = await this.forms.owned(formId, organizationId, tx);
      await this.scope.publicForm(actor, current, tx);
      if (current.kind === "registration")
        throw new DomainError(
          "REGISTRATION_REQUIRED",
          "Register through the event registration page.",
          409,
        );
      return this.intake.accept(actor, current, values, tx);
    });
  }

  async list(
    actor: TrustedActor,
    formId: string,
    input: unknown = {},
  ): Promise<SubmissionList> {
    z.uuid().parse(formId);
    const filter = submissionFilterSchema.parse(input);
    const scope = await this.scope.require(actor, formId, "submissions.read");
    return this.repository.list(scope.organizationId, formId, filter);
  }

  async detail(actor: TrustedActor, id: string): Promise<SubmissionDto> {
    z.uuid().parse(id);
    const scope = await this.submissionScope(actor, id, "submissions.read");
    return this.repository.detail(id, scope.organizationId);
  }

  async updateStatus(
    actor: TrustedActor,
    id: string,
    input: unknown,
  ): Promise<SubmissionDto> {
    z.uuid().parse(id);
    const values = submissionStatusSchema.parse(input);
    return this.db.transaction(async (tx) => {
      await this.forms.lockInstalled(tx);
      const scope = await this.submissionScope(
        actor,
        id,
        "submissions.manage",
        tx,
      );
      await this.repository.owned(id, scope.organizationId, tx);
      await tx
        .update(formSubmission)
        .set({ status: values.status, updatedAt: new Date() })
        .where(
          and(
            eq(formSubmission.id, id),
            eq(formSubmission.organizationId, scope.organizationId),
          ),
        );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "submission.status.updated",
        targetId: id,
      });
      return this.repository.detail(id, scope.organizationId, tx);
    });
  }

  async exportCsv(
    actor: TrustedActor,
    formId: string,
    input: unknown = {},
  ): Promise<string> {
    z.uuid().parse(formId);
    const filter = submissionFilterSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope.lock(
        actor,
        formId,
        "submissions.export",
        tx,
      );
      await this.forms.owned(formId, scope.organizationId, tx);
      const rows = await this.repository.rows(
        scope.organizationId,
        formId,
        filter,
        5001,
        tx,
      );
      if (rows.length > 5000)
        throw new DomainError(
          "EXPORT_TOO_LARGE",
          "Narrow the date range to export at most 5,000 responses.",
          422,
        );
      const parsed = rows.map((row) => ({
        ...row,
        definition: formDefinitionSchema.parse(row.definition),
        answers: formSubmitSchema.shape.answers.parse(row.submission.answers),
      }));
      // Include labels in column identity so a later field rename never silently
      // changes the interpretation of an earlier response.
      const columns = [
        ...new Set(
          parsed.flatMap((row) =>
            row.definition.fields
              .filter((field) => !isContentElement(field.type))
              .map((field) => `${field.label} [${field.id}]`),
          ),
        ),
      ];
      const header = [
        "Submission ID",
        "Received at",
        "Form version",
        "Status",
        "Applicant name",
        "Verified applicant email",
        ...columns,
      ];
      const lines = [header.map(csvCell).join(",")];
      for (const row of parsed) {
        const answers = new Map(
          row.definition.fields
            .filter((field) => !isContentElement(field.type))
            .map((field) => [
              `${field.label} [${field.id}]`,
              row.answers[field.id] ?? "",
            ]),
        );
        lines.push(
          [
            row.submission.id,
            row.submission.createdAt.toISOString(),
            row.versionNumber,
            row.submission.status,
            row.applicantName ?? "",
            row.applicantEmail ?? "",
            ...columns.map((column) => answers.get(column) ?? ""),
          ]
            .map(csvCell)
            .join(","),
        );
      }
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "submissions.exported",
        targetId: formId,
      });
      return `\uFEFF${lines.join("\r\n")}\r\n`;
    });
  }

  async delete(actor: TrustedActor, id: string, input: unknown): Promise<void> {
    z.uuid().parse(id);
    submissionDeleteSchema.parse(input);
    await this.db.transaction(async (tx) => {
      await this.forms.lockInstalled(tx);
      const scope = await this.submissionScope(
        actor,
        id,
        "submissions.manage",
        tx,
      );
      if (scope.current.kind === "registration")
        throw new DomainError(
          "REGISTRATION_RECORD_RETAINED",
          "Registration responses are retained with their booking history. Cancel the registration to release its place.",
          409,
        );
      await this.repository.owned(id, scope.organizationId, tx);
      await tx
        .delete(formSubmission)
        .where(
          and(
            eq(formSubmission.id, id),
            eq(formSubmission.organizationId, scope.organizationId),
          ),
        );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "submission.deleted",
        targetId: id,
      });
    });
  }

  async retryNotification(
    actor: TrustedActor,
    id: string,
  ): Promise<SubmissionDto> {
    z.uuid().parse(id);
    return this.db.transaction(async (tx) => {
      await this.forms.lockInstalled(tx);
      const scope = await this.submissionScope(
        actor,
        id,
        "submissions.manage",
        tx,
      );
      const submission = await this.repository.owned(
        id,
        scope.organizationId,
        tx,
      );
      const current = await this.forms.owned(
        submission.formId,
        scope.organizationId,
        tx,
      );
      const { recipients } = formSettingsSchema.parse({
        recipients: current.recipients,
        retentionDays: current.retentionDays,
      });
      if (recipients.length) {
        await tx
          .update(formNotification)
          .set({
            status: "pending",
            attempts: 0,
            reviewedAt: sql`clock_timestamp()`,
            availableAt: new Date(),
            leaseToken: null,
            leaseExpiresAt: null,
            lastErrorCode: null,
            sentAt: null,
          })
          .where(
            and(
              eq(formNotification.submissionId, id),
              eq(formNotification.organizationId, scope.organizationId),
              eq(formNotification.status, "failed"),
              inArray(formNotification.recipient, recipients),
            ),
          );
      }
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "submission.notification.retried",
        targetId: id,
      });
      return this.repository.detail(id, scope.organizationId, tx);
    });
  }

  async retentionPreview(
    actor: TrustedActor,
    formId: string,
  ): Promise<RetentionPreview> {
    z.uuid().parse(formId);
    const scope = await this.scope.require(actor, formId, "submissions.manage");
    const current = await this.forms.owned(formId, scope.organizationId);
    if (!current.retentionDays)
      throw new DomainError(
        "RETENTION_NOT_CONFIGURED",
        "Choose a retention period before previewing deletion.",
        409,
      );
    const cutoff = new Date(
      Date.now() - current.retentionDays * 86400000,
    ).toISOString();
    const ids = await this.retainedIds(
      scope.organizationId,
      formId,
      cutoff,
      this.db,
    );
    return {
      formId,
      retentionDays: current.retentionDays,
      cutoff,
      count: ids.length,
      previewToken: this.retentionHash(
        formId,
        current.retentionDays,
        cutoff,
        ids,
      ),
    };
  }

  async deleteRetained(
    actor: TrustedActor,
    formId: string,
    input: unknown,
  ): Promise<{ deleted: number }> {
    z.uuid().parse(formId);
    const values = retentionDeleteSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope.lock(
        actor,
        formId,
        "submissions.manage",
        tx,
      );
      if (scope.current.kind === "registration")
        throw new DomainError(
          "REGISTRATION_RECORD_RETAINED",
          "Registration responses are retained with their booking history. Cancel the registration to release its place.",
          409,
        );
      const current = await this.forms.owned(formId, scope.organizationId, tx);
      if (
        !current.retentionDays ||
        new Date(values.cutoff).getTime() >
          Date.now() - current.retentionDays * 86400000
      ) {
        throw new DomainError(
          "RETENTION_PREVIEW_CHANGED",
          "Preview the current retention selection again before deleting.",
          409,
        );
      }
      const ids = await this.retainedIds(
        scope.organizationId,
        formId,
        values.cutoff,
        tx,
      );
      if (
        this.retentionHash(
          formId,
          current.retentionDays,
          values.cutoff,
          ids,
        ) !== values.previewToken
      ) {
        throw new DomainError(
          "RETENTION_PREVIEW_CHANGED",
          "The selected submissions changed. Preview deletion again.",
          409,
        );
      }
      if (ids.length)
        await tx
          .delete(formSubmission)
          .where(
            and(
              eq(formSubmission.organizationId, scope.organizationId),
              inArray(formSubmission.id, ids),
            ),
          );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "submissions.retention.deleted",
        targetId: formId,
      });
      return { deleted: ids.length };
    });
  }

  private async retainedIds(
    organizationId: string,
    formId: string,
    cutoff: string,
    executor: DatabaseExecutor,
  ): Promise<string[]> {
    // Preview and delete one bounded batch. The next batch requires a new preview.
    const rows = await executor
      .select({ id: formSubmission.id })
      .from(formSubmission)
      .where(
        and(
          eq(formSubmission.organizationId, organizationId),
          eq(formSubmission.formId, formId),
          lte(formSubmission.createdAt, new Date(cutoff)),
        ),
      )
      .orderBy(asc(formSubmission.createdAt), asc(formSubmission.id))
      .limit(1000);
    return rows.map((row) => row.id);
  }

  private retentionHash(
    formId: string,
    days: number,
    cutoff: string,
    ids: string[],
  ): string {
    return createHash("sha256")
      .update(JSON.stringify({ formId, days, cutoff, ids }))
      .digest("hex");
  }

  private async submissionScope(
    actor: TrustedActor,
    id: string,
    operation: "submissions.read" | "submissions.manage",
    executor: DatabaseExecutor = this.db,
  ) {
    const { organizationId } = await this.authorization.approved(
      actor,
      executor,
    );
    const row = await this.repository.owned(id, organizationId, executor);
    return this.scope.require(actor, row.formId, operation, executor);
  }
}
