import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  gte,
  lt,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { clubEvent } from "../../../db/schema/events";
import { user } from "../../../db/schema/auth";
import { form, formSubmission, formVersion } from "../../../db/schema/forms";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { formDefinitionSchema, formSubmitSchema } from "./form_schemas";
import {
  inboxFilterSchema,
  inboxFormQuerySchema,
  type InboxPage,
  type InboxFormPage,
} from "./inbox_schemas";
import { EventService } from "../events/EventService";

/** Staff CRM projection of existing responses; never establishes identity or membership. */
export class InboxService {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {}

  private async scope(actor: TrustedActor, executor: DatabaseExecutor) {
    const scope = await this.authorization.approved(actor, executor);
    await this.authorization.features.require(
      scope.organizationId,
      "forms",
      executor,
    );
    const websiteAllowed = scope.capabilities.includes("submissions.read");
    const eventIds = (await this.authorization.features.enabled(
      scope.organizationId,
      "events",
      executor,
    ))
      ? await new EventService(this.db, this.authorization).responseEventIds(
          actor,
          executor,
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
    return { organizationId: scope.organizationId, formScope };
  }

  async forms(
    actor: TrustedActor,
    input: unknown = {},
  ): Promise<InboxFormPage> {
    const filter = inboxFormQuerySchema.parse(input);
    return this.db.transaction(
      async (tx) => {
        const { formScope } = await this.scope(actor, tx);
        return this.sourceForms(tx, formScope, filter);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  private async sourceForms(
    executor: DatabaseExecutor,
    scope: SQL | undefined,
    filter: ReturnType<typeof inboxFormQuerySchema.parse>,
  ): Promise<InboxFormPage> {
    const title = sql<string>`${form.draft}->>'title'`;
    const search = `%${filter.q.replace(/[\\%_]/g, "\\$&")}%`;
    const where = and(
      scope,
      filter.id ? eq(form.id, filter.id) : undefined,
      filter.q
        ? or(ilike(title, search), ilike(clubEvent.title, search))
        : undefined,
    );
    const from = () =>
      executor
        .select({
          id: form.id,
          title,
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
        );
    const [count] = await executor
      .select({ total: sql<number>`count(*)::int` })
      .from(form)
      .leftJoin(
        clubEvent,
        and(
          eq(clubEvent.id, form.eventId),
          eq(clubEvent.organizationId, form.organizationId),
        ),
      )
      .where(where);
    const total = count?.total ?? 0;
    const page = Math.min(
      filter.page,
      Math.max(1, Math.ceil(total / filter.pageSize)),
    );
    const forms = await from()
      .where(where)
      .orderBy(asc(title), asc(form.id))
      .offset((page - 1) * filter.pageSize)
      .limit(filter.pageSize);
    return { forms, page, pageSize: filter.pageSize, total };
  }

  async list(actor: TrustedActor, input: unknown = {}): Promise<InboxPage> {
    const filter = inboxFilterSchema.parse(input);
    return this.db.transaction(
      async (tx) => {
        const scope = await this.scope(actor, tx);
        const conditions = [
          scope.formScope,
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
        const rows = await tx
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
        const totals = await tx
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
        return {
          total: counts.new + counts.reviewing + counts.closed,
          counts,
          page: filter.page,
          hasMore: rows.length > 100,
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
                identityRequired &&
                row.userId &&
                row.email &&
                row.emailVerified,
              ),
              preview:
                text(messageField?.id).slice(0, 180) ||
                "Open to read this response.",
            };
          }),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
