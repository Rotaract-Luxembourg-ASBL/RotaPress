import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { form, formVersion } from "../../../db/schema/forms";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type TrustedActor,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { FormScopePolicy } from "./FormScopePolicy";
import { FormRepository } from "./FormRepository";
import {
  formArchiveSchema,
  formCreateSchema,
  formDefinitionSchema,
  formPublishSchema,
  formSaveSchema,
  formSettingsSchema,
  starterDefinition,
} from "./form_schemas";
import type { FormDto, FormSettingsDto, PublicFormDto } from "./form_types";
import { templateDefinition } from "./form_templates";

export class FormService {
  private readonly scope: FormScopePolicy;
  private readonly repository: FormRepository;
  private readonly audit = new AuditRepository();

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {
    this.repository = new FormRepository(db);
    this.scope = new FormScopePolicy(db, authorization);
  }

  async list(actor: TrustedActor): Promise<FormDto[]> {
    const scope = await this.authorization.require(actor, "forms.edit");
    const forms = await this.repository.list(scope.organizationId);
    if (!scope.capabilities.includes("submissions.read")) return forms;
    const counts = await this.repository.responseCounts(scope.organizationId);
    const byForm = new Map(
      counts.map(({ formId, ...values }) => [formId, values]),
    );
    return forms.map((item) => ({
      ...item,
      responses: byForm.get(item.id) ?? { total: 0, new: 0 },
    }));
  }

  /** Copies content only; responses, recipients, webhooks and publication stay separate. */
  async duplicate(
    actor: TrustedActor,
    id: string,
    input: unknown,
  ): Promise<FormDto> {
    z.uuid().parse(id);
    const values = z
      .strictObject({ expectedRevision: z.int().positive() })
      .parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope.lock(actor, id, "edit", tx);
      this.expectRevision(scope.current.draftRevision, values.expectedRevision);
      const definition = formDefinitionSchema.parse(scope.current.draft);
      const [row] = await tx
        .insert(form)
        .values({
          organizationId: scope.organizationId,
          eventId: scope.current.eventId,
          kind: scope.current.kind,
          draft: {
            ...definition,
            title: `${definition.title.slice(0, 153)} (copy)`,
          },
        })
        .returning();
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "form.duplicated",
        targetId: row.id,
      });
      return this.scope.dto(actor, row, tx);
    });
  }

  async create(actor: TrustedActor, input: unknown): Promise<FormDto> {
    return this.db.transaction((tx) => this.createDraft(actor, input, tx));
  }

  /** Website installation creates its contact form in the same transaction. */
  async createDraft(
    actor: TrustedActor,
    input: unknown,
    tx: Transaction,
  ): Promise<FormDto> {
    const values = formCreateSchema.parse(input);
    const scope = await this.authorization.lock(actor, "forms.edit", tx);
    const [row] = await tx
      .insert(form)
      .values({
        organizationId: scope.organizationId,
        kind: values.kind,
        draft: templateDefinition(
          values.templateId ?? values.kind,
          values.title,
        ),
      })
      .returning();
    await this.audit.record(tx, {
      organizationId: scope.organizationId,
      actorUserId: actor.userId,
      action: "form.created",
      targetId: row.id,
    });
    return this.scope.dto(actor, row, tx);
  }

  async eventForms(actor: TrustedActor, eventId: string): Promise<FormDto[]> {
    await this.scope.events.detail(actor, eventId);
    const { organizationId } = await this.authorization.approved(actor);
    await this.authorization.features.require(organizationId, "forms");
    const rows = await this.repository.list(organizationId, eventId);
    return Promise.all(rows.map((row) => this.detail(actor, row.id)));
  }

  /** Event readiness needs publication state, never questions or private answers. */
  async eventReadiness(
    actor: TrustedActor,
    eventId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    await this.scope.events.detail(actor, eventId, executor);
    const { organizationId } = await this.authorization.approved(
      actor,
      executor,
    );
    const rows = await executor
      .select({
        id: form.id,
        kind: form.kind,
        archived: form.archived,
        publishedVersionId: form.publishedVersionId,
      })
      .from(form)
      .where(
        and(eq(form.organizationId, organizationId), eq(form.eventId, eventId)),
      );
    return rows.map(({ publishedVersionId, ...row }) => ({
      ...row,
      published: !row.archived && publishedVersionId !== null,
    }));
  }

  async createEventForm(
    actor: TrustedActor,
    eventId: string,
    input: unknown,
  ): Promise<FormDto> {
    const values = z
      .strictObject({
        kind: z.enum(["event", "registration"]),
        title: z.string().trim().min(1).max(160),
      })
      .parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId, event } = await this.scope.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      this.scope.events.requireCapability(event, "events.edit");
      this.scope.events.requireActive(event);
      if (event.archived)
        throw new DomainError("EVENT_ARCHIVED", "This event is archived.", 409);
      await this.scope.modules.requireEnabled(
        organizationId,
        eventId,
        "forms",
        tx,
      );
      const [row] = await tx
        .insert(form)
        .values({
          organizationId,
          eventId,
          kind: values.kind,
          draft: starterDefinition(values.kind, values.title),
        })
        .returning();
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.form.created",
        targetId: row.id,
      });
      return this.scope.dto(actor, row, tx);
    });
  }

  async detail(actor: TrustedActor, id: string): Promise<FormDto> {
    z.uuid().parse(id);
    const scope = await this.scope.require(actor, id, "read");
    return this.scope.dto(actor, scope.current);
  }

  async save(
    actor: TrustedActor,
    id: string,
    input: unknown,
  ): Promise<FormDto> {
    z.uuid().parse(id);
    const values = formSaveSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope.lock(actor, id, "edit", tx);
      const current = scope.current;
      this.expectRevision(current.draftRevision, values.expectedRevision);
      if (current.archived)
        throw new DomainError(
          "FORM_ARCHIVED",
          "Restore this form before editing.",
          409,
        );
      const [row] = await tx
        .update(form)
        .set({
          draft: values.definition,
          draftRevision: current.draftRevision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(eq(form.id, id), eq(form.organizationId, scope.organizationId)),
        )
        .returning();
      return this.scope.dto(actor, row, tx);
    });
  }

  async publish(
    actor: TrustedActor,
    id: string,
    input: unknown,
  ): Promise<FormDto> {
    z.uuid().parse(id);
    const values = formPublishSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope.lock(actor, id, "publish", tx);
      const current = scope.current;
      this.expectRevision(current.draftRevision, values.expectedRevision);
      if (current.archived)
        throw new DomainError(
          "FORM_ARCHIVED",
          "Restore this form before publishing.",
          409,
        );
      const definition = formDefinitionSchema.parse(current.draft);
      const [existing] = await tx
        .select()
        .from(formVersion)
        .where(
          and(
            eq(formVersion.formId, id),
            eq(formVersion.number, current.draftRevision),
          ),
        );
      const version =
        existing ??
        (
          await tx
            .insert(formVersion)
            .values({
              formId: id,
              organizationId: scope.organizationId,
              number: current.draftRevision,
              definition,
              createdBy: actor.userId,
            })
            .returning()
        )[0];
      const [row] = await tx
        .update(form)
        .set({ publishedVersionId: version.id, updatedAt: new Date() })
        .where(
          and(eq(form.id, id), eq(form.organizationId, scope.organizationId)),
        )
        .returning();
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "form.published",
        targetId: version.id,
      });
      return this.scope.dto(actor, row, tx);
    });
  }

  async archive(
    actor: TrustedActor,
    id: string,
    input: unknown,
  ): Promise<FormDto> {
    z.uuid().parse(id);
    const values = formArchiveSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope.lock(actor, id, "publish", tx);
      const current = scope.current;
      this.expectRevision(current.draftRevision, values.expectedRevision);
      const [row] = await tx
        .update(form)
        .set({
          archived: values.archived,
          publishedVersionId: null,
          draftRevision: current.draftRevision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(eq(form.id, id), eq(form.organizationId, scope.organizationId)),
        )
        .returning();
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: values.archived ? "form.archived" : "form.restored",
        targetId: id,
      });
      return this.scope.dto(actor, row, tx);
    });
  }

  async settings(actor: TrustedActor, id: string): Promise<FormSettingsDto> {
    z.uuid().parse(id);
    const { current: row } = await this.scope.require(actor, id, "settings");
    return formSettingsSchema.parse({
      recipients: row.recipients,
      retentionDays: row.retentionDays,
    });
  }

  async updateSettings(
    actor: TrustedActor,
    id: string,
    input: unknown,
  ): Promise<FormSettingsDto> {
    z.uuid().parse(id);
    const values = formSettingsSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.scope.lock(actor, id, "settings", tx);
      if (
        scope.current.kind === "registration" &&
        values.retentionDays !== null
      )
        throw new DomainError(
          "REGISTRATION_RECORD_RETAINED",
          "Registration responses are retained with booking history.",
          409,
        );
      await tx
        .update(form)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(eq(form.id, id), eq(form.organizationId, scope.organizationId)),
        );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "form.settings.updated",
        targetId: id,
      });
      return values;
    });
  }

  async publicForm(
    id: string,
    actor: TrustedActor | null = null,
  ): Promise<PublicFormDto> {
    z.uuid().parse(id);
    const current = await this.repository.owned(
      id,
      await this.repository.installedOrganization(),
    );
    await this.scope.publicForm(actor, current);
    if (current.kind === "registration")
      throw new DomainError(
        "REGISTRATION_REQUIRED",
        "Open the event registration page to register.",
        404,
      );
    return this.repository.publicForm(id);
  }

  async publicEventForms(actor: TrustedActor | null, eventId: string) {
    const { organizationId } = await this.scope.publicAccess.require(
      actor,
      eventId,
      "forms",
    );
    const rows = await this.db
      .select()
      .from(form)
      .where(
        and(
          eq(form.organizationId, organizationId),
          eq(form.eventId, eventId),
          eq(form.kind, "event"),
          eq(form.archived, false),
        ),
      );
    return Promise.all(
      rows
        .filter((row) => row.publishedVersionId)
        .map((row) => this.repository.publicForm(row.id)),
    );
  }

  async publishedMembershipForm(): Promise<PublicFormDto | null> {
    const organizationId = await this.repository.installedOrganization();
    if (!(await this.authorization.features.enabled(organizationId, "forms"))) {
      if (
        !(await this.repository.activeMembershipFormId(organizationId, this.db))
      )
        return null;
      throw new DomainError(
        "APPLICATIONS_PAUSED",
        "Membership applications are temporarily paused. Contact the club for help.",
        409,
      );
    }
    return this.repository.publishedMembershipForm();
  }

  /** Called while holding the installed organization's transaction lock. */
  async assertDirectMembershipApplicationAllowed(
    organizationId: string,
    executor: DatabaseExecutor,
  ): Promise<void> {
    if (
      await this.repository.activeMembershipFormId(organizationId, executor)
    ) {
      await this.authorization.features.require(
        organizationId,
        "forms",
        executor,
      );
      throw new DomainError(
        "FORM_REQUIRED",
        "Complete the published membership application form to apply.",
        409,
      );
    }
  }

  async assertOwnedForms(
    organizationId: string,
    ids: string[],
    executor: DatabaseExecutor = this.db,
    eventId: string | null = null,
  ): Promise<void> {
    if (ids.includes(""))
      throw new DomainError(
        "FORM_REFERENCE_REQUIRED",
        "Choose a form for each Form block before saving.",
        422,
      );
    const uniqueIds = [...new Set(z.array(z.uuid()).max(100).parse(ids))];
    for (const id of uniqueIds) {
      const row = await this.repository.owned(id, organizationId, executor);
      if (row.eventId !== eventId || (eventId && row.kind !== "event"))
        throw new DomainError(
          "FORM_SCOPE",
          eventId
            ? "Choose an enquiry form belonging to this event. Use the Event registration block for bookings."
            : "Event forms belong on their own event pages.",
          422,
        );
    }
  }

  async assertPublishedForms(
    organizationId: string,
    ids: string[],
    executor: DatabaseExecutor = this.db,
    eventId: string | null = null,
  ): Promise<void> {
    const uniqueIds = [...new Set(z.array(z.uuid()).max(100).parse(ids))];
    const rows = await this.repository.publishedIds(
      organizationId,
      uniqueIds,
      executor,
    );
    if (
      rows.length !== uniqueIds.length ||
      rows.some(
        (row) => row.eventId !== eventId || row.archived || !row.version,
      )
    ) {
      throw new DomainError(
        "FORM_NOT_PUBLISHED",
        "Publish each referenced form before publishing this page.",
        422,
      );
    }
  }

  private expectRevision(actual: number, expected: number): void {
    if (actual !== expected)
      throw new DomainError(
        "FORM_REVISION_CONFLICT",
        "This form changed in another session. Your entered content has not been saved.",
        409,
      );
  }
}
