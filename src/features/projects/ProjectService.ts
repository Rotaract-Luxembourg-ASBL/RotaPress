import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
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

  async list(actor: TrustedActor): Promise<ProjectDto[]> {
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    await this.authorization.features.require(organizationId, "projects");
    const rows = await this.db
      .select()
      .from(project)
      .where(eq(project.organizationId, organizationId))
      .orderBy(desc(project.updatedAt), project.id);
    return rows.map((row) => this.dto(row));
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

  async create(actor: TrustedActor, input: unknown): Promise<ProjectDto> {
    const content = projectContentSchema.parse(input);
    return this.db.transaction(async (tx) => {
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
    });
  }

  async change(
    actor: TrustedActor,
    id: string,
    operation: ProjectAction,
    input: unknown,
  ): Promise<ProjectDto> {
    z.uuid().parse(id);
    const values =
      operation === "save"
        ? projectSaveSchema.parse(input)
        : projectActionSchema.parse(input);
    return this.db.transaction(async (tx) => {
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
    });
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
