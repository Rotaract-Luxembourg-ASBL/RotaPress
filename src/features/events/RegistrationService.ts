import "server-only";
import type { GuestSource } from "./guest_sources";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  eventRegistration,
  registrationSettings,
} from "../../../db/schema/registrations";
import { user } from "../../../db/schema/auth";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  requireVerifiedActor,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { MembershipService } from "../members/MembershipService";
import { FormRepository } from "../forms/FormRepository";
import { FormScopePolicy } from "../forms/FormScopePolicy";
import { SubmissionIntake } from "../forms/SubmissionIntake";
import {
  registrationSettingsSchema,
  cancellationSchema,
  type RegistrationDto,
  type RegistrationSettingsDto,
} from "./registration_schemas";

export class RegistrationService {
  private readonly scope: FormScopePolicy;
  private readonly forms: FormRepository;
  private readonly intake: SubmissionIntake;
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    memberships: MembershipService,
  ) {
    this.scope = new FormScopePolicy(db, authorization);
    this.forms = new FormRepository(db);
    this.intake = new SubmissionIntake(db, memberships);
  }

  async templateSnapshot(
    organizationId: string,
    eventId: string,
    tx: Transaction,
  ) {
    const [row] = await tx
      .select({
        authority: registrationSettings.authority,
        capacity: registrationSettings.capacity,
        sourceFormId: registrationSettings.formId,
      })
      .from(registrationSettings)
      .where(
        and(
          eq(registrationSettings.organizationId, organizationId),
          eq(registrationSettings.eventId, eventId),
        ),
      );
    return !row || row.authority === "luma"
      ? { authority: "none" as const, capacity: null, sourceFormId: null }
      : { ...row, authority: row.authority };
  }

  async initializeCopy(
    organizationId: string,
    eventId: string,
    source: {
      authority: "none" | "native";
      capacity: number | null;
      sourceFormId: string | null;
    },
    forms: Map<string, string>,
    tx: Transaction,
  ) {
    const formId = source.sourceFormId ? forms.get(source.sourceFormId) : null;
    if (source.authority === "native" && !formId)
      throw new DomainError(
        "EVENT_COPY_REGISTRATION_FORM",
        "The registration form cannot be copied. Review the source event.",
        409,
      );
    await tx.insert(registrationSettings).values({
      organizationId,
      eventId,
      authority: source.authority,
      capacity: source.capacity,
      formId,
      open: false,
    });
  }

  async cancelEventRegistrations(
    organizationId: string,
    eventId: string,
    now: Date,
    tx: Transaction,
  ) {
    await tx
      .update(registrationSettings)
      .set({ open: false, version: sql`${registrationSettings.version} + 1` })
      .where(
        and(
          eq(registrationSettings.eventId, eventId),
          eq(registrationSettings.organizationId, organizationId),
        ),
      );
    await tx
      .update(eventRegistration)
      .set({ status: "cancelled", cancelledAt: now })
      .where(
        and(
          eq(eventRegistration.eventId, eventId),
          eq(eventRegistration.organizationId, organizationId),
          eq(eventRegistration.status, "confirmed"),
        ),
      );
  }

  /** Internal integration contract. Caller holds the authorized event transaction lock. */
  async authoritySnapshot(
    organizationId: string,
    eventId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    return this.settings(eventId, organizationId, executor);
  }

  async setLumaPublication(
    organizationId: string,
    eventId: string,
    expectedVersion: number,
    publish: boolean,
    tx: Transaction,
  ) {
    const current = await this.settings(eventId, organizationId, tx);
    if (current.version !== expectedVersion)
      throw new DomainError(
        "REGISTRATION_SETTINGS_CHANGED",
        "Registration settings changed. Review the Luma publication again.",
        409,
      );
    const [existing] = await tx
      .select({ id: eventRegistration.id })
      .from(eventRegistration)
      .where(
        and(
          eq(eventRegistration.eventId, eventId),
          eq(eventRegistration.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (existing)
      throw new DomainError(
        "REGISTRATION_AUTHORITY_LOCKED",
        "Native registration history prevents switching to Luma. A separate migration decision is required.",
        409,
      );
    if (!publish && current.authority !== "luma")
      throw new DomainError(
        "LUMA_NOT_PUBLISHED",
        "This event has no published Luma registration authority.",
        409,
      );
    const settings = {
      authority: "luma" as const,
      formId: null,
      capacity: null,
      open: publish,
      externalLocked: true,
      version: current.version + 1,
    };
    await tx
      .insert(registrationSettings)
      .values({ ...settings, organizationId, eventId })
      .onConflictDoUpdate({
        target: registrationSettings.eventId,
        set: settings,
      });
  }

  private async settings(
    eventId: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<RegistrationSettingsDto> {
    const [row] = await executor
      .select()
      .from(registrationSettings)
      .where(
        and(
          eq(registrationSettings.eventId, eventId),
          eq(registrationSettings.organizationId, organizationId),
        ),
      );
    const [total] = await executor
      .select({ value: count() })
      .from(eventRegistration)
      .where(
        and(
          eq(eventRegistration.eventId, eventId),
          eq(eventRegistration.organizationId, organizationId),
          eq(eventRegistration.status, "confirmed"),
        ),
      );
    return {
      authority: row?.authority ?? "none",
      formId: row?.formId ?? null,
      capacity: row?.capacity ?? null,
      open: row?.open ?? false,
      version: row?.version ?? 0,
      confirmedCount: total.value,
      externalLocked: row?.externalLocked ?? false,
    };
  }

  async workspace(actor: TrustedActor, eventId: string) {
    const event = await this.scope.events.detail(actor, eventId);
    this.scope.events.requireCapability(event, "events.responses.manage");
    const { organizationId } = await this.authorization.approved(actor);
    return this.settings(eventId, organizationId);
  }

  /** Page editors can preview configuration without access to attendee records. */
  async editorPreview(actor: TrustedActor, eventId: string) {
    await this.scope.events.detail(actor, eventId);
    const { organizationId } = await this.authorization.approved(actor);
    const [settings] = await this.db
      .select({
        authority: registrationSettings.authority,
        formId: registrationSettings.formId,
        open: registrationSettings.open,
      })
      .from(registrationSettings)
      .where(
        and(
          eq(registrationSettings.organizationId, organizationId),
          eq(registrationSettings.eventId, eventId),
        ),
      );
    return (
      settings ?? { authority: "none" as const, formId: null, open: false }
    );
  }

  /** Safe readiness projection for all event staff; counts and attendees stay private. */
  async readiness(
    actor: TrustedActor,
    eventId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    await this.scope.events.detail(actor, eventId, executor);
    const { organizationId } = await this.authorization.approved(
      actor,
      executor,
    );
    const settings = await this.settings(eventId, organizationId, executor);
    return {
      authority: settings.authority,
      formId: settings.formId,
      open: settings.open,
      full:
        settings.capacity !== null &&
        settings.confirmedCount >= settings.capacity,
    };
  }

  async configure(
    actor: TrustedActor,
    eventId: string,
    input: unknown,
    transaction?: Transaction,
  ) {
    z.uuid().parse(eventId);
    const values = registrationSettingsSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const { organizationId, event } = await this.scope.events.lockEvent(
        actor,
        eventId,
        tx,
      );
      this.scope.events.requireCapability(event, "events.publish");
      this.scope.events.requireActive(event);
      if (event.archived)
        throw new DomainError("EVENT_ARCHIVED", "This event is archived.", 409);
      await this.scope.modules.requireEnabled(
        organizationId,
        eventId,
        "registration",
        tx,
      );
      const current = await this.settings(eventId, organizationId, tx);
      if (current.externalLocked)
        throw new DomainError(
          "REGISTRATION_AUTHORITY_LOCKED",
          "Luma is this event's registration authority. Unpublish its link to close local access; switching authority requires a separate migration decision.",
          409,
        );
      if (current.version !== values.expectedVersion)
        throw new DomainError(
          "REGISTRATION_SETTINGS_CHANGED",
          "Reload the current registration settings.",
          409,
        );
      if (values.formId) {
        await this.scope.modules.requireEnabled(
          organizationId,
          eventId,
          "forms",
          tx,
        );
        const form = await this.forms.owned(values.formId, organizationId, tx);
        if (form.eventId !== eventId || form.kind !== "registration")
          throw new DomainError(
            "REGISTRATION_FORM_SCOPE",
            "Choose this event's registration form.",
            422,
          );
        if (values.open && (form.archived || !form.publishedVersionId))
          throw new DomainError(
            "FORM_NOT_PUBLISHED",
            "Publish the registration form before opening registration.",
            409,
          );
      }
      const [existing] = await tx
        .select({ id: eventRegistration.id })
        .from(eventRegistration)
        .where(eq(eventRegistration.eventId, eventId))
        .limit(1);
      if (
        existing &&
        (values.authority !== current.authority ||
          values.formId !== current.formId)
      )
        throw new DomainError(
          "REGISTRATION_AUTHORITY_LOCKED",
          "Existing registrations require a separate migration decision before changing the authority or form. Close registration to stop new bookings.",
          409,
        );
      if (values.capacity !== null && values.capacity < current.confirmedCount)
        throw new DomainError(
          "REGISTRATION_CAPACITY",
          "Capacity cannot be lower than the confirmed registrations.",
          409,
        );
      const expectedVersion = values.expectedVersion;
      const settings = {
        authority: values.authority,
        formId: values.formId,
        capacity: values.capacity,
        open: values.open,
      };
      await tx
        .insert(registrationSettings)
        .values({
          ...settings,
          eventId,
          organizationId,
          version: expectedVersion + 1,
        })
        .onConflictDoUpdate({
          target: registrationSettings.eventId,
          set: { ...settings, version: expectedVersion + 1 },
        });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.registration.configured",
        targetId: eventId,
      });
      return this.settings(eventId, organizationId, tx);
    };
    return transaction ? apply(transaction) : this.db.transaction(apply);
  }

  async publicForm(actor: TrustedActor | null, eventId: string) {
    z.uuid().parse(eventId);
    const { organizationId, event } = await this.scope.publicAccess.require(
      actor,
      eventId,
      "registration",
    );
    const settings = await this.settings(eventId, organizationId);
    if (settings.authority !== "native" || !settings.formId)
      throw new DomainError(
        "REGISTRATION_UNAVAILABLE",
        "Registration is unavailable.",
        404,
      );
    return {
      event,
      open: settings.open,
      full:
        settings.capacity !== null &&
        settings.confirmedCount >= settings.capacity,
      form: await this.forms.publicForm(settings.formId),
    };
  }

  async register(actor: TrustedActor, eventId: string, input: unknown) {
    z.uuid().parse(eventId);
    requireVerifiedActor(actor);
    return this.db.transaction(async (tx) => {
      // The existing organization lock also serializes capacity, publication,
      // module changes, form revisions and cancellations. No SMTP runs here.
      const organizationId = await this.forms.lockInstalled(tx);
      const { event } = await this.scope.publicAccess.require(
        actor,
        eventId,
        "registration",
        tx,
      );
      const settings = await this.settings(eventId, organizationId, tx);
      if (settings.authority !== "native" || !settings.formId)
        throw new DomainError(
          "REGISTRATION_UNAVAILABLE",
          "Registration is unavailable.",
          404,
        );
      const form = await this.forms.owned(settings.formId, organizationId, tx);
      const receipt = await this.intake.accept(actor, form, input, tx);
      const [prior] = await tx
        .select()
        .from(eventRegistration)
        .where(
          and(
            eq(eventRegistration.submissionId, receipt.id),
            eq(eventRegistration.userId, actor.userId),
            eq(eventRegistration.organizationId, organizationId),
          ),
        );
      if (prior)
        return {
          ...receipt,
          message:
            prior.status === "cancelled"
              ? "This registration was cancelled."
              : receipt.message,
          registration: this.dto(prior),
        };
      if (!settings.open)
        throw new DomainError(
          "REGISTRATION_CLOSED",
          "Registration is closed.",
          409,
        );
      const [duplicate] = await tx
        .select({ id: eventRegistration.id })
        .from(eventRegistration)
        .where(
          and(
            eq(eventRegistration.eventId, eventId),
            eq(eventRegistration.userId, actor.userId),
            eq(eventRegistration.status, "confirmed"),
          ),
        );
      if (duplicate)
        throw new DomainError(
          "ALREADY_REGISTERED",
          "You already have a confirmed place. Open My registrations to view it.",
          409,
        );
      if (
        settings.capacity !== null &&
        settings.confirmedCount >= settings.capacity
      )
        throw new DomainError("EVENT_FULL", "This event is full.", 409);
      const [row] = await tx
        .insert(eventRegistration)
        .values({
          eventId,
          organizationId,
          formId: form.id,
          submissionId: receipt.id,
          userId: actor.userId,
          eventTitle: event.title,
        })
        .returning();
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.registration.confirmed",
        targetId: row.id,
      });
      return { ...receipt, registration: this.dto(row) };
    });
  }

  async mine(actor: TrustedActor): Promise<RegistrationDto[]> {
    requireVerifiedActor(actor);
    const organizationId = await this.forms.installedOrganization();
    const rows = await this.db
      .select()
      .from(eventRegistration)
      .where(
        and(
          eq(eventRegistration.userId, actor.userId),
          eq(eventRegistration.organizationId, organizationId),
        ),
      )
      .orderBy(desc(eventRegistration.createdAt))
      .limit(200);
    return rows.map((row) => this.dto(row));
  }

  async list(actor: TrustedActor, eventId: string) {
    await this.workspace(actor, eventId);
    const { organizationId } = await this.authorization.approved(actor);
    const rows = await this.db
      .select({
        registration: eventRegistration,
        name: sql<string>`coalesce(nullif(${user.name}, ''), ${user.email})`,
        email: user.email,
      })
      .from(eventRegistration)
      .innerJoin(user, eq(user.id, eventRegistration.userId))
      .where(
        and(
          eq(eventRegistration.eventId, eventId),
          eq(eventRegistration.organizationId, organizationId),
        ),
      )
      .orderBy(desc(eventRegistration.createdAt))
      .limit(500);
    return rows.map((row) => ({
      ...this.dto(row.registration),
      name: row.name,
      email: row.email,
      formId: row.registration.formId,
      submissionId: row.registration.submissionId,
    }));
  }

  /** Internal portal contract; caller authorizes the event or explicit guest grant. */
  async guestSources(
    org: string,
    eventId: string,
    executor: DatabaseExecutor = this.db,
    id?: string,
  ): Promise<GuestSource[]> {
    const rows = await executor
      .select({
        id: eventRegistration.id,
        userId: user.id,
        name: sql<string>`coalesce(nullif(${user.name}, ''), ${user.email})`,
        email: user.email,
        status: eventRegistration.status,
      })
      .from(eventRegistration)
      .innerJoin(user, eq(user.id, eventRegistration.userId))
      .where(
        and(
          eq(eventRegistration.organizationId, org),
          eq(eventRegistration.eventId, eventId),
          id ? eq(eventRegistration.id, id) : undefined,
        ),
      )
      .orderBy(desc(eventRegistration.createdAt))
      .limit(201);
    return rows.map((row) => ({
      ...row,
      kind: "native",
      available: row.status === "confirmed",
      observedAt: null,
    }));
  }

  async cancel(
    actor: TrustedActor,
    id: string,
    input: unknown,
    eventId?: string,
  ) {
    z.uuid().parse(id);
    cancellationSchema.parse(input);
    requireVerifiedActor(actor);
    return this.db.transaction(async (tx) => {
      const organizationId = await this.forms.lockInstalled(tx);
      const [row] = await tx
        .select()
        .from(eventRegistration)
        .where(
          and(
            eq(eventRegistration.id, id),
            eq(eventRegistration.organizationId, organizationId),
          ),
        );
      if (
        !row ||
        (eventId ? row.eventId !== eventId : row.userId !== actor.userId)
      )
        throw new DomainError(
          "REGISTRATION_NOT_FOUND",
          "This registration is unavailable.",
          404,
        );
      if (eventId) {
        const event = await this.scope.events.detail(actor, eventId, tx);
        this.scope.events.requireCapability(event, "events.responses.manage");
      }
      if (row.status === "cancelled") return this.dto(row);
      const [cancelled] = await tx
        .update(eventRegistration)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(eventRegistration.id, id))
        .returning();
      await this.audit.record(tx, {
        organizationId,
        actorUserId: actor.userId,
        action: "event.registration.cancelled",
        targetId: id,
      });
      return this.dto(cancelled);
    });
  }

  private dto(row: typeof eventRegistration.$inferSelect): RegistrationDto {
    return {
      id: row.id,
      eventId: row.eventId,
      eventTitle: row.eventTitle,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
  }
}
