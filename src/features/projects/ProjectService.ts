import "server-only";
import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { project } from "../../../db/schema/projects";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { MediaService } from "../media/MediaService";
import { collectionPage, searchPattern } from "@/core/collections";
import { projectCollectionSchema } from "./project_collection";
import {
  projectActionSchema,
  projectContentSchema,
  projectSaveSchema,
  type ProjectDto,
} from "./project_schemas";

type ProjectRow = typeof project.$inferSelect;
type ProjectAction = "save" | "publish" | "unpublish" | "archive" | "restore";

export class ProjectService {
  private readonly audit = new AuditRepository();

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly media: MediaService,
  ) {}

  async query(actor: TrustedActor, raw: unknown = {}) {
    const input = projectCollectionSchema.parse(raw);
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    await this.authorization.features.require(organizationId, "projects");
    return this.db.transaction(
      async (tx) => {
        const scope = eq(project.organizationId, organizationId);
        const active = eq(project.archived, false);
        const predicates = {
          all: undefined,
          active,
          published: and(active, isNotNull(project.published)),
          draft: and(active, isNull(project.published)),
          archived: eq(project.archived, true),
        };
        const where = and(
          scope,
          predicates[input.status],
          input.search
            ? ilike(
                sql`concat_ws(' ', ${project.draft}->>'title', ${project.draft}->>'summary', ${project.draft}->>'location')`,
                searchPattern(input.search),
              )
            : undefined,
        );
        const [matched] = await tx
          .select({ total: count() })
          .from(project)
          .where(where);
        const [counts] = await tx
          .select({
            all: count(),
            active: sql<number>`count(*) filter (where ${active})`.mapWith(
              Number,
            ),
            published:
              sql<number>`count(*) filter (where ${predicates.published})`.mapWith(
                Number,
              ),
            draft:
              sql<number>`count(*) filter (where ${predicates.draft})`.mapWith(
                Number,
              ),
            archived:
              sql<number>`count(*) filter (where ${predicates.archived})`.mapWith(
                Number,
              ),
          })
          .from(project)
          .where(scope);
        const page = collectionPage(matched.total, input.page, input.pageSize);
        const rows = await tx
          .select()
          .from(project)
          .where(where)
          .orderBy(
            input.sort === "title"
              ? sql`${project.draft}->>'title'`
              : desc(project.updatedAt),
            project.id,
          )
          .limit(input.pageSize)
          .offset(input.offset ?? (page - 1) * input.pageSize);
        return {
          items: rows.map((row) => this.dto(row)),
          total: matched.total,
          page,
          pageSize: input.pageSize,
          counts,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async detail(actor: TrustedActor, id: string): Promise<ProjectDto> {
    z.uuid().parse(id);
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    await this.authorization.features.require(organizationId, "projects");
    return this.dto(await this.row(organizationId, id, this.db));
  }

  async create(actor: TrustedActor, input: unknown, executor?: Transaction): Promise<ProjectDto> {
    const content = projectContentSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.edit",
        tx,
      );
      await this.authorization.features.require(organizationId, "projects", tx);
      const id = randomUUID();
      const stem =
        content.title
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/gu, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/gu, "-")
          .replace(/^-|-$/gu, "")
          .slice(0, 120)
          .replace(/-$/u, "") || "project";
      // The immutable identifier makes concurrent identical titles collision-safe.
      const slug = `${stem}-${id}`;
      const [created] = await tx
        .insert(project)
        .values({ id, organizationId, slug, draft: content })
        .returning();
      await this.retain(created, tx);
      await this.record(actor, created, "created", tx);
      return this.dto(created);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  async change(
    actor: TrustedActor,
    id: string,
    operation: ProjectAction,
    input: unknown,
    executor?: Transaction,
  ): Promise<ProjectDto> {
    z.uuid().parse(id);
    const values =
      operation === "save"
        ? projectSaveSchema.parse(input)
        : projectActionSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        operation === "publish" || operation === "unpublish"
          ? "cms.publish"
          : "cms.edit",
        tx,
      );
      await this.authorization.features.require(organizationId, "projects", tx);
      const row = await this.row(organizationId, id, tx);
      if (row.version !== values.expectedVersion)
        throw new DomainError(
          "PROJECT_CONFLICT",
          "This project changed. Reopen it to review the latest version before saving.",
          409,
        );
      if (operation === "archive" && row.published)
        await this.authorization.require(actor, "cms.publish", tx);
      if (row.archived && operation !== "restore" && operation !== "archive")
        throw new DomainError(
          "PROJECT_ARCHIVED",
          "Restore this project before editing or publishing it.",
          409,
        );
      if (operation === "restore" && !row.archived)
        throw new DomainError(
          "PROJECT_NOT_ARCHIVED",
          "This project is already active.",
          409,
        );
      const changes: Partial<ProjectRow> = {
        version: row.version + 1,
        updatedAt: new Date(),
      };
      if (operation === "save" && "content" in values)
        changes.draft = values.content;
      if (operation === "publish") {
        const content = projectContentSchema.parse(row.draft);
        if (!content.summary)
          throw new DomainError(
            "PROJECT_SUMMARY_REQUIRED",
            "Add a short summary before publishing this project.",
            422,
          );
        changes.published = content;
      }
      if (operation === "unpublish" || operation === "archive")
        changes.published = null;
      if (operation === "archive") changes.archived = true;
      if (operation === "restore") {
        changes.archived = false;
        changes.published = null;
      }
      const [updated] = await tx
        .update(project)
        .set(changes)
        .where(
          and(
            eq(project.id, id),
            eq(project.organizationId, organizationId),
            eq(project.version, row.version),
          ),
        )
        .returning();
      if (!updated)
        throw new DomainError(
          "PROJECT_CONFLICT",
          "This project changed. Reopen it before continuing.",
          409,
        );
      await this.retain(updated, tx);
      await this.record(actor, updated, operation, tx);
      return this.dto(updated);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  private async row(
    organizationId: string,
    id: string,
    executor: DatabaseExecutor,
  ) {
    const [row] = await executor
      .select()
      .from(project)
      .where(
        and(eq(project.organizationId, organizationId), eq(project.id, id)),
      );
    if (!row)
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This project is unavailable.",
        404,
      );
    return row;
  }

  private dto(row: ProjectRow): ProjectDto {
    const draft = projectContentSchema.parse(row.draft);
    const published = row.published
      ? projectContentSchema.parse(row.published)
      : null;
    return {
      id: row.id,
      slug: row.slug,
      version: row.version,
      draft,
      published,
      changed: JSON.stringify(draft) !== JSON.stringify(published),
      archived: row.archived,
    };
  }

  private async retain(row: ProjectRow, tx: Transaction) {
    for (const slot of ["draft", "published"] as const) {
      const content = row[slot] ? projectContentSchema.parse(row[slot]) : null;
      await this.media.replaceUsage(
        `project:${row.id}:${slot}`,
        row.organizationId,
        content?.coverImageId ? [content.coverImageId] : [],
        tx,
        slot === "published",
      );
    }
  }

  private record(
    actor: TrustedActor,
    row: ProjectRow,
    action: string,
    executor: DatabaseExecutor,
  ) {
    return this.audit.record(executor, {
      organizationId: row.organizationId,
      actorUserId: actor.userId,
      action: `project.${action}`,
      targetId: row.id,
    });
  }
}
