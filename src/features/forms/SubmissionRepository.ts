import "server-only";
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { user } from "../../../db/schema/auth";
import {
  formNotification,
  formSubmission,
  formVersion,
} from "../../../db/schema/forms";
import {
  DomainError,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import {
  formDefinitionSchema,
  formSubmitSchema,
  type SubmissionFilter,
} from "./form_schemas";
import type { SubmissionDto, SubmissionSummary } from "./form_types";

export class SubmissionRepository {
  constructor(private readonly db: Database) {}

  conditions(
    organizationId: string,
    formId: string,
    filter: SubmissionFilter,
  ): SQL[] {
    const conditions = [
      eq(formSubmission.organizationId, organizationId),
      eq(formSubmission.formId, formId),
    ];
    if (filter.status)
      conditions.push(eq(formSubmission.status, filter.status));
    if (filter.after)
      conditions.push(gte(formSubmission.createdAt, new Date(filter.after)));
    if (filter.before)
      conditions.push(lte(formSubmission.createdAt, new Date(filter.before)));
    return conditions;
  }

  async owned(
    id: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select()
      .from(formSubmission)
      .where(
        and(
          eq(formSubmission.id, id),
          eq(formSubmission.organizationId, organizationId),
        ),
      );
    if (!row)
      throw new DomainError(
        "SUBMISSION_NOT_FOUND",
        "This submission is unavailable.",
        404,
      );
    return row;
  }

  async replay(
    formId: string,
    organizationId: string,
    requestId: string,
    executor: DatabaseExecutor,
  ) {
    const [row] = await executor
      .select()
      .from(formSubmission)
      .where(
        and(
          eq(formSubmission.formId, formId),
          eq(formSubmission.organizationId, organizationId),
          eq(formSubmission.requestId, requestId),
        ),
      );
    return row;
  }

  async rows(
    organizationId: string,
    formId: string,
    filter: SubmissionFilter,
    limit: number,
    executor: DatabaseExecutor = this.db,
  ) {
    return executor
      .select({
        submission: formSubmission,
        definition: formVersion.definition,
        versionNumber: formVersion.number,
        applicantName: user.name,
        applicantEmail: user.email,
      })
      .from(formSubmission)
      .innerJoin(
        formVersion,
        and(
          eq(formVersion.id, formSubmission.versionId),
          eq(formVersion.organizationId, formSubmission.organizationId),
        ),
      )
      .leftJoin(user, eq(user.id, formSubmission.submittedByUserId))
      .where(and(...this.conditions(organizationId, formId, filter)))
      .orderBy(desc(formSubmission.createdAt), desc(formSubmission.id))
      .limit(limit);
  }

  async list(
    organizationId: string,
    formId: string,
    filter: SubmissionFilter,
  ): Promise<{ submissions: SubmissionSummary[]; hasMore: boolean }> {
    // The list projection intentionally never selects answer or applicant data.
    const rows = await this.db
      .select({
        id: formSubmission.id,
        formId: formSubmission.formId,
        status: formSubmission.status,
        createdAt: formSubmission.createdAt,
        versionNumber: formVersion.number,
        definition: formVersion.definition,
      })
      .from(formSubmission)
      .innerJoin(
        formVersion,
        and(
          eq(formVersion.id, formSubmission.versionId),
          eq(formVersion.organizationId, formSubmission.organizationId),
        ),
      )
      .where(and(...this.conditions(organizationId, formId, filter)))
      .orderBy(desc(formSubmission.createdAt), desc(formSubmission.id))
      .limit(101);
    const page = rows.slice(0, 100);
    const jobs = page.length
      ? await this.db
          .select({
            submissionId: formNotification.submissionId,
            status: formNotification.status,
          })
          .from(formNotification)
          .where(
            and(
              eq(formNotification.organizationId, organizationId),
              inArray(
                formNotification.submissionId,
                page.map((row) => row.id),
              ),
            ),
          )
      : [];
    return {
      hasMore: rows.length > 100,
      submissions: page.map((row) => ({
        id: row.id,
        formId: row.formId,
        formTitle: formDefinitionSchema.parse(row.definition).title,
        status: row.status,
        versionNumber: row.versionNumber,
        receivedAt: row.createdAt.toISOString(),
        notifications: jobs
          .filter((job) => job.submissionId === row.id)
          .reduce(
            (counts, job) => {
              counts[job.status] += 1;
              return counts;
            },
            { pending: 0, processing: 0, sent: 0, failed: 0 },
          ),
      })),
    };
  }

  async detail(
    id: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<SubmissionDto> {
    const submission = await this.owned(id, organizationId, executor);
    const [version] = await executor
      .select()
      .from(formVersion)
      .where(
        and(
          eq(formVersion.id, submission.versionId),
          eq(formVersion.organizationId, organizationId),
        ),
      );
    if (!version)
      throw new DomainError(
        "FORM_VERSION_NOT_FOUND",
        "This submission's form version is unavailable.",
        404,
      );
    const definition = formDefinitionSchema.parse(version.definition);
    const jobs = await executor
      .select()
      .from(formNotification)
      .where(
        and(
          eq(formNotification.submissionId, id),
          eq(formNotification.organizationId, organizationId),
        ),
      );
    const [applicant] = submission.submittedByUserId
      ? await executor
          .select({ name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, submission.submittedByUserId))
      : [];
    return {
      id,
      formId: submission.formId,
      formTitle: definition.title,
      versionId: version.id,
      versionNumber: version.number,
      status: submission.status,
      receivedAt: submission.createdAt.toISOString(),
      definition,
      answers: formSubmitSchema.shape.answers.parse(submission.answers),
      membershipStatus: submission.membershipStatus,
      applicant: applicant ?? null,
      notifications: jobs.reduce(
        (counts, job) => {
          counts[job.status] += 1;
          return counts;
        },
        { pending: 0, processing: 0, sent: 0, failed: 0 },
      ),
      delivery: jobs.map((job) => ({
        id: job.id,
        recipient: job.recipient,
        status: job.status,
        attempts: job.attempts,
        lastErrorCode: job.lastErrorCode,
        availableAt: job.availableAt.toISOString(),
        sentAt: job.sentAt?.toISOString() ?? null,
      })),
    };
  }
}
