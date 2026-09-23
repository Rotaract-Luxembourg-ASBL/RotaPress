import "server-only";
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  gte,
  lt,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { clubEvent } from "../../../db/schema/events";
import { user } from "../../../db/schema/auth";
import { form, formSubmission, formVersion } from "../../../db/schema/forms";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { formDefinitionSchema, formSubmitSchema } from "./form_schemas";
import { inboxFilterSchema, type InboxPage } from "./inbox_schemas";
import { EventService } from "../events/EventService";

/** Staff CRM projection of existing responses; never establishes identity or membership. */
export class InboxService {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(actor: TrustedActor, input: unknown = {}): Promise<InboxPage> {
    const filter = inboxFilterSchema.parse(input);
    const scope = await this.authorization.approved(actor);
    await this.authorization.features.require(scope.organizationId, "forms");
    const websiteAllowed = scope.capabilities.includes("submissions.read");
    const eventIds = (await this.authorization.features.enabled(
      scope.organizationId,
      "events",
    ))
      ? await new EventService(this.db, this.authorization).responseEventIds(
          actor,
        )
      : [];
    if (!websiteAllowed && !eventIds.length)
      throw new DomainError(
        "ACCESS_DENIED",
        "You do not have permission to review form responses.",
      );
    const formScope = and(
      eq(form.organizationId, scope.organizationId),
      or(
        websiteAllowed ? isNull(form.eventId) : undefined,
        eventIds.length ? inArray(form.eventId, eventIds) : undefined,
      ),
    );
    const conditions = [
      formScope,
      eq(formSubmission.organizationId, scope.organizationId),
    ];
    if (filter.formId) conditions.push(eq(form.id, filter.formId));
    if (filter.kind) conditions.push(eq(form.kind, filter.kind));
    if (filter.eventId) conditions.push(eq(form.eventId, filter.eventId));
    if (filter.after)
      conditions.push(
        gte(
          formSubmission.createdAt,
          new Date(`${filter.after}T00:00:00.000Z`),
        ),
      );
    if (filter.before)
      conditions.push(
        lt(
          formSubmission.createdAt,
          new Date(Date.parse(`${filter.before}T00:00:00.000Z`) + 86400000),
        ),
      );
    if (filter.status)
      conditions.push(eq(formSubmission.status, filter.status));
    if (filter.q) {
      const search = `%${filter.q.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(
        or(
          ilike(sql`${formSubmission.answers}::text`, search),
          ilike(user.name, search),
          ilike(user.email, search),
          ilike(sql`${formVersion.definition}->>'title'`, search),
        ),
      );
    }
    const rows = await this.db
      .select({
        id: formSubmission.id,
        formId: form.id,
        eventId: form.eventId,
        eventTitle: clubEvent.title,
        kind: form.kind,
        status: formSubmission.status,
        createdAt: formSubmission.createdAt,
        definition: formVersion.definition,
        answers: formSubmission.answers,
        userId: formSubmission.submittedByUserId,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
      })
      .from(formSubmission)
      .innerJoin(
        form,
        and(
          eq(form.id, formSubmission.formId),
          eq(form.organizationId, formSubmission.organizationId),
        ),
      )
      .innerJoin(
        formVersion,
        and(
          eq(formVersion.id, formSubmission.versionId),
          eq(formVersion.formId, form.id),
          eq(formVersion.organizationId, form.organizationId),
        ),
      )
      .leftJoin(user, eq(user.id, formSubmission.submittedByUserId))
      .leftJoin(
        clubEvent,
        and(
          eq(clubEvent.id, form.eventId),
          eq(clubEvent.organizationId, form.organizationId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(formSubmission.createdAt), desc(formSubmission.id))
      .offset(filter.page * 100)
      .limit(101);
    const totals = await this.db
      .select({
        status: formSubmission.status,
        count: sql<number>`count(*)::integer`,
      })
      .from(formSubmission)
      .innerJoin(
        form,
        and(
          eq(form.id, formSubmission.formId),
          eq(form.organizationId, formSubmission.organizationId),
        ),
      )
      .innerJoin(
        formVersion,
        and(
          eq(formVersion.id, formSubmission.versionId),
          eq(formVersion.formId, form.id),
          eq(formVersion.organizationId, form.organizationId),
        ),
      )
      .leftJoin(user, eq(user.id, formSubmission.submittedByUserId))
      .where(and(...conditions))
      .groupBy(formSubmission.status);
    const counts = { new: 0, reviewing: 0, closed: 0 };
    for (const item of totals) counts[item.status] = item.count;
    const forms = await this.db
      .select({
        id: form.id,
        draft: form.draft,
        kind: form.kind,
        eventId: form.eventId,
        eventTitle: clubEvent.title,
        archived: form.archived,
      })
      .from(form)
      .leftJoin(
        clubEvent,
        and(
          eq(clubEvent.id, form.eventId),
          eq(clubEvent.organizationId, form.organizationId),
        ),
      )
      .where(formScope)
      .limit(1000);
    return {
      total: counts.new + counts.reviewing + counts.closed,
      counts,
      page: filter.page,
      hasMore: rows.length > 100,
      forms: forms.map((item) => ({
        id: item.id,
        title: formDefinitionSchema.parse(item.draft).title,
        kind: item.kind,
        eventId: item.eventId,
        eventTitle: item.eventTitle,
        archived: item.archived,
      })),
      messages: rows.slice(0, 100).map((row) => {
        const definition = formDefinitionSchema.parse(row.definition);
        const answers = formSubmitSchema.shape.answers.parse(row.answers);
        const text = (id?: string) =>
          id && typeof answers[id] === "string" ? String(answers[id]) : "";
        const emailField = definition.fields.find(
          (field) => field.type === "email",
        );
        const nameField = definition.fields.find(
          (field) => field.id === "name" || field.id === "full_name",
        );
        const messageField = definition.fields.find(
          (field) => field.type === "textarea",
        );
        const identityRequired =
          row.kind === "membership" || row.kind === "registration";
        return {
          id: row.id,
          formId: row.formId,
          formTitle: definition.title,
          eventId: row.eventId,
          eventTitle: row.eventTitle,
          kind: row.kind,
          status: row.status,
          receivedAt: row.createdAt.toISOString(),
          name:
            (identityRequired ? row.name : null) ||
            text(nameField?.id) ||
            "Website visitor",
          email:
            (identityRequired ? row.email : null) ||
            text(emailField?.id).toLowerCase() ||
            null,
          verified: Boolean(
            identityRequired && row.userId && row.email && row.emailVerified,
          ),
          preview:
            text(messageField?.id).slice(0, 180) ||
            "Open to read this response.",
        };
      }),
    };
  }
}
