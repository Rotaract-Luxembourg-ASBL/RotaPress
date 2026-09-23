import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  count,
  sql,
} from "drizzle-orm";
import { installation, organization } from "../../../db/schema/club";
import { form, formVersion, formSubmission } from "../../../db/schema/forms";
import {
  DomainError,
  type DatabaseExecutor,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { formDefinitionSchema } from "./form_schemas";
import type { FormDto, PublicFormDto } from "./form_types";

export class FormRepository {
  constructor(private readonly db: Database) {}

  async responseCounts(organizationId: string) {
    return this.db
      .select({
        formId: form.id,
        total: count(formSubmission.id),
        new: sql<number>`count(${formSubmission.id}) filter (where ${formSubmission.status} = 'new')`.mapWith(
          Number,
        ),
      })
      .from(form)
      .leftJoin(
        formSubmission,
        and(
          eq(formSubmission.formId, form.id),
          eq(formSubmission.organizationId, organizationId),
        ),
      )
      .where(and(eq(form.organizationId, organizationId), isNull(form.eventId)))
      .groupBy(form.id);
  }

  async installedOrganization(
    executor: DatabaseExecutor = this.db,
  ): Promise<string> {
    const [row] = await executor
      .select({ id: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    if (!row?.id)
      throw new DomainError("FORM_NOT_FOUND", "This form is unavailable.", 404);
    return row.id;
  }

  async lockInstalled(tx: Transaction): Promise<string> {
    const id = await this.installedOrganization(tx);
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, id))
      .for("update");
    return id;
  }

  async owned(
    id: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select()
      .from(form)
      .where(and(eq(form.id, id), eq(form.organizationId, organizationId)));
    if (!row)
      throw new DomainError("FORM_NOT_FOUND", "This form is unavailable.", 404);
    return row;
  }

  async version(
    id: string,
    formId: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select()
      .from(formVersion)
      .where(
        and(
          eq(formVersion.id, id),
          eq(formVersion.formId, formId),
          eq(formVersion.organizationId, organizationId),
        ),
      );
    if (!row)
      throw new DomainError(
        "FORM_VERSION_NOT_FOUND",
        "This form version is unavailable.",
        404,
      );
    return row;
  }

  async dto(
    row: typeof form.$inferSelect,
    executor: DatabaseExecutor = this.db,
  ): Promise<FormDto> {
    const version = row.publishedVersionId
      ? await this.version(
          row.publishedVersionId,
          row.id,
          row.organizationId,
          executor,
        )
      : null;
    return {
      id: row.id,
      kind: row.kind,
      archived: row.archived,
      draftRevision: row.draftRevision,
      draft: formDefinitionSchema.parse(row.draft),
      publishedVersionId: version?.id ?? null,
      publishedVersionNumber: version?.number ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(organizationId: string, eventId?: string): Promise<FormDto[]> {
    const rows = await this.db
      .select()
      .from(form)
      .where(
        and(
          eq(form.organizationId, organizationId),
          eventId ? eq(form.eventId, eventId) : isNull(form.eventId),
        ),
      )
      .orderBy(desc(form.updatedAt))
      .limit(200);
    return Promise.all(rows.map((row) => this.dto(row)));
  }

  async publicForm(
    id: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<PublicFormDto> {
    const organizationId = await this.installedOrganization(executor);
    const row = await this.owned(id, organizationId, executor);
    if (row.archived || !row.publishedVersionId)
      throw new DomainError("FORM_NOT_FOUND", "This form is unavailable.", 404);
    const version = await this.version(
      row.publishedVersionId,
      row.id,
      organizationId,
      executor,
    );
    return {
      id: row.id,
      kind: row.kind,
      ...(row.eventId ? { eventId: row.eventId } : {}),
      versionId: version.id,
      versionNumber: version.number,
      definition: formDefinitionSchema.parse(version.definition),
    };
  }

  async publishedMembershipForm(): Promise<PublicFormDto | null> {
    const organizationId = await this.installedOrganization();
    const id = await this.activeMembershipFormId(organizationId, this.db);
    return id ? this.publicForm(id) : null;
  }

  async activeMembershipFormId(
    organizationId: string,
    executor: DatabaseExecutor,
  ): Promise<string | null> {
    const [row] = await executor
      .select({ id: form.id })
      .from(form)
      .where(
        and(
          eq(form.organizationId, organizationId),
          eq(form.kind, "membership"),
          eq(form.archived, false),
          isNotNull(form.publishedVersionId),
        ),
      )
      .orderBy(asc(form.createdAt), asc(form.id))
      .limit(1);
    return row?.id ?? null;
  }

  async publishedIds(
    organizationId: string,
    ids: string[],
    executor: DatabaseExecutor,
  ) {
    if (!ids.length) return [];
    return executor
      .select({
        id: form.id,
        version: form.publishedVersionId,
        archived: form.archived,
        eventId: form.eventId,
      })
      .from(form)
      .where(
        and(eq(form.organizationId, organizationId), inArray(form.id, ids)),
      );
  }
}
