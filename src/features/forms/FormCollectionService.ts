import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { form, formSubmission, formVersion } from "../../../db/schema/forms";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { FormRepository } from "./FormRepository";
import { formCollectionSchema, type FormCollection } from "./form_collection";
import { EventService } from "../events/EventService";
import { EventModuleService } from "../events/EventModuleService";

export class FormCollectionService {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(
    actor: TrustedActor,
    input: unknown,
    eventId?: string,
    executor?: Transaction,
  ): Promise<FormCollection> {
    const scope = eventId
      ? await this.authorization.approved(actor, executor ?? this.db)
      : await this.authorization.require(actor, "forms.edit", executor ?? this.db);
    const events = new EventService(this.db, this.authorization);
    const event = eventId ? await events.detail(actor, eventId, executor ?? this.db) : undefined;
    await this.authorization.features.require(scope.organizationId, "forms", executor ?? this.db);
    const states = event
      ? await new EventModuleService(this.db, events).states(
          scope.organizationId,
          event.id,
          executor ?? this.db,
        )
      : [];
    const activeEventForms = Boolean(
      event &&
      !event.archived &&
      !event.cancelled &&
      ["forms", "website"].every((key) =>
        states.some((state) => state.key === key && state.state === "enabled"),
      ),
    );
    const query = formCollectionSchema.parse(input);
    const canReadResponses = event
      ? event.capabilities.includes("events.responses.manage")
      : scope.capabilities.includes("submissions.read");
    if (query.sort === "responses" && !canReadResponses)
      throw new DomainError(
        "ACCESS_DENIED",
        "Response permission is required to sort by response counts.",
      );
    const boundary = and(
      eq(form.organizationId, scope.organizationId),
      eventId ? eq(form.eventId, eventId) : isNull(form.eventId),
    );
    const published = and(
      eq(form.archived, false),
      isNotNull(form.publishedVersionId),
    );
    const draft = and(
      eq(form.archived, false),
      isNull(form.publishedVersionId),
    );
    const filter = and(
      boundary,
      query.status === "archived"
        ? eq(form.archived, true)
        : query.status === "published"
          ? published
          : query.status === "draft"
            ? draft
            : query.status === "active"
              ? eq(form.archived, false)
              : undefined,
      query.kind === "all" ? undefined : eq(form.kind, query.kind),
      query.search
        ? ilike(
            sql`${form.draft}->>'title'`,
            `%${query.search.replace(/[\\%_]/g, "\\$&")}%`,
          )
        : undefined,
    );
    const responseCount = sql<number>`(select count(*) from ${formSubmission} where ${formSubmission.formId} = ${form.id} and ${formSubmission.organizationId} = ${form.organizationId})`;
    const read = async (tx: Transaction) => {
        const [totals] = await tx
          .select({
            all: count(),
            active:
              sql<number>`count(*) filter (where not ${form.archived})`.mapWith(
                Number,
              ),
            published:
              sql<number>`count(*) filter (where ${published})`.mapWith(Number),
            draft: sql<number>`count(*) filter (where ${draft})`.mapWith(
              Number,
            ),
            archived:
              sql<number>`count(*) filter (where ${form.archived})`.mapWith(
                Number,
              ),
            changes:
              sql<number>`count(*) filter (where not ${form.archived} and ${form.draftRevision} > coalesce((select number from club.form_version where id = ${form.publishedVersionId}), 0))`.mapWith(
                Number,
              ),
          })
          .from(form)
          .where(boundary);
        const [matched] = await tx
          .select({ total: count() })
          .from(form)
          .where(filter);
        const page = Math.min(
          query.page,
          Math.max(1, Math.ceil(matched.total / query.pageSize)),
        );
        const rows = await tx
          .select({
            row: form,
            publishedVersion: {
              id: formVersion.id,
              number: formVersion.number,
            },
            responses: canReadResponses ? responseCount : sql<number>`0`,
            newResponses: canReadResponses
              ? sql<number>`(select count(*) from ${formSubmission} where ${formSubmission.formId} = ${form.id} and ${formSubmission.organizationId} = ${form.organizationId} and ${formSubmission.status} = 'new')`
              : sql<number>`0`,
          })
          .from(form)
          .leftJoin(
            formVersion,
            and(
              eq(formVersion.id, form.publishedVersionId),
              eq(formVersion.organizationId, form.organizationId),
              eq(formVersion.formId, form.id),
            ),
          )
          .where(filter)
          .orderBy(
            query.sort === "name"
              ? asc(sql`${form.draft}->>'title'`)
              : query.sort === "responses"
                ? desc(responseCount)
                : desc(form.updatedAt),
            form.id,
          )
          .limit(query.pageSize)
          .offset(query.offset ?? (page - 1) * query.pageSize);
        const repository = new FormRepository(this.db);
        const forms = rows.map(
          ({ row, publishedVersion, responses, newResponses }) => ({
            ...repository.dtoWithVersion(row, publishedVersion),
            ...(event
              ? {
                  event: {
                    id: event.id,
                    title: event.title,
                    canEdit:
                      activeEventForms &&
                      event.capabilities.includes("events.edit"),
                    canPublish:
                      activeEventForms &&
                      event.capabilities.includes("events.publish"),
                    canReadSubmissions: canReadResponses,
                  },
                }
              : {}),
            ...(canReadResponses
              ? {
                  responses: {
                    total: Number(responses),
                    new: Number(newResponses),
                  },
                }
              : {}),
          }),
        );
        return {
          forms,
          total: matched.total,
          counts: totals,
          page,
          pageSize: query.pageSize,
        };
      };
    return executor ? read(executor) : this.db.transaction(read,
      { isolationLevel: "repeatable read", accessMode: "read only" });
  }
}
