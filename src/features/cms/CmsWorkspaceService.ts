import "server-only";
import { alias } from "drizzle-orm/pg-core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  cmsContent,
  cmsRevision,
  cmsSite,
  cmsVariant,
} from "../../../db/schema/cms";
import { cmsPagePlacement } from "../../../db/schema/cms-workspace";
import type { Database } from "@/infrastructure/database/client";
import {
  DomainError,
  type AuthorizationService,
  type Transaction,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { AuditRepository } from "@/core/audit/AuditRepository";
import type { CmsService } from "./CmsService";
import { CmsRepository } from "./CmsRepository";
import { siteSettingsSchema } from "./cms_schemas";
import { revisionDto } from "./cms_validation";
import {
  pageBatchSchema,
  pageQuerySchema,
  quickEditSchema,
  patternSaveSchema,
  type PageCollection,
  type PageQuery,
} from "./cms_workspace_schemas";
import { kitIdSchema } from "./kits/catalogue";

const stateCondition = (status: PageQuery["status"]): SQL => {
  if (status === "archived") return isNotNull(cmsContent.archivedAt);
  const active = isNull(cmsContent.archivedAt);
  if (status === "draft")
    return and(active, isNull(cmsVariant.publishedRevisionId))!;
  if (status === "published")
    return and(active, isNotNull(cmsVariant.publishedRevisionId))!;
  if (status === "changes")
    return and(
      active,
      isNotNull(cmsVariant.publishedRevisionId),
      ne(cmsVariant.draftRevisionId, cmsVariant.publishedRevisionId),
    )!;
  return active;
};

/** Collection operations retain normal CMS transactions and exact saved revisions. */
export class CmsWorkspaceService {
  private readonly repository: CmsRepository;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly cms: CmsService,
  ) {
    this.repository = new CmsRepository(db);
  }

  async list(actor: TrustedActor, input: unknown): Promise<PageCollection> {
    const query = pageQuerySchema.parse(input);
    const { organizationId } = await this.authorization.require(
      actor,
      "cms.edit",
    );
    return this.db.transaction(
      (tx) => this.readCollection(organizationId, query, tx),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  private async readCollection(
    organizationId: string,
    query: PageQuery,
    tx: Transaction,
  ): Promise<PageCollection> {
    const [site] = await tx
      .select({ draft: cmsSite.draft })
      .from(cmsSite)
      .where(
        and(
          eq(cmsSite.organizationId, organizationId),
          eq(cmsSite.locale, query.locale),
        ),
      );
    const settings = site ? siteSettingsSchema.parse(site.draft) : null;
    const setup = settings?.templateSetup;
    const selected =
      setup?.installations
        .find((item) => item.kitId === setup.selectedKitId)
        ?.recipes.map((item) => item.id) ?? [];
    if (settings?.homePageId) selected.push(settings.homePageId);
    const kit = sql<
      string | null
    >`${cmsRevision.data}->'root'->'props'->>'kit'`;
    const example = sql<boolean>`coalesce((${cmsRevision.data}->'root'->'props'->>'demonstration')::boolean, false)`;
    const collection =
      query.collection === "all"
        ? undefined
        : query.collection === "examples"
          ? eq(example, true)
          : and(
              eq(example, false),
              setup
                ? or(
                    isNull(kit),
                    eq(kit, setup.selectedKitId),
                    selected.length
                      ? inArray(cmsContent.id, selected)
                      : undefined,
                  )
                : undefined,
            );
    const base = and(
      eq(cmsContent.organizationId, organizationId),
      isNull(cmsContent.eventId),
      eq(cmsContent.kind, query.kind),
      eq(cmsVariant.locale, query.locale),
      collection,
    );
    const search = query.search
      ? or(
          ilike(
            cmsRevision.title,
            `%${query.search.replaceAll(/[%_\\]/g, "\\$&")}%`,
          ),
          ilike(
            cmsRevision.slug,
            `%${query.search.replaceAll(/[%_\\]/g, "\\$&")}%`,
          ),
        )
      : undefined;
    const parentVariant = alias(cmsVariant, "parent_variant");
    const parentRevision = alias(cmsRevision, "parent_revision");
    const from = () =>
      tx
        .select({
          id: cmsContent.id,
          kind: cmsContent.kind,
          locale: cmsVariant.locale,
          title: cmsRevision.title,
          slug: cmsRevision.slug,
          draftRevisionId: cmsRevision.id,
          publishedRevisionId: cmsVariant.publishedRevisionId,
          archivedAt: cmsContent.archivedAt,
          updatedAt: cmsRevision.createdAt,
          kit,
          demonstration: example,
          parentId: cmsPagePlacement.parentId,
          parentTitle: parentRevision.title,
          position: cmsPagePlacement.position,
          placementVersion: cmsPagePlacement.version,
          childCount: sql<number>`(select count(*)::int from club.cms_page_placement child_placement
            join club.cms_content child_content on child_content.id = child_placement.content_id
            join club.cms_variant child_variant on child_variant.content_id = child_content.id
            where child_placement.parent_id = ${cmsContent.id} and child_placement.organization_id = ${organizationId}
            and child_content.archived_at is null and child_content.event_id is null and child_content.kind = 'page'
            and child_variant.locale = ${query.locale})`,
        })
        .from(cmsContent)
        .innerJoin(cmsVariant, eq(cmsVariant.contentId, cmsContent.id))
        .innerJoin(cmsRevision, eq(cmsRevision.id, cmsVariant.draftRevisionId))
        .leftJoin(
          cmsPagePlacement,
          eq(cmsPagePlacement.contentId, cmsContent.id),
        )
        .leftJoin(
          parentVariant,
          and(
            eq(parentVariant.contentId, cmsPagePlacement.parentId),
            eq(parentVariant.organizationId, organizationId),
            eq(parentVariant.locale, query.locale),
          ),
        )
        .leftJoin(
          parentRevision,
          eq(parentRevision.id, parentVariant.draftRevisionId),
        );
    const grouped = await tx
      .select({
        all: sql<number>`count(*) filter (where ${stateCondition("all")})::int`,
        draft: sql<number>`count(*) filter (where ${stateCondition("draft")})::int`,
        published: sql<number>`count(*) filter (where ${stateCondition("published")})::int`,
        changes: sql<number>`count(*) filter (where ${stateCondition("changes")})::int`,
        archived: sql<number>`count(*) filter (where ${stateCondition("archived")})::int`,
      })
      .from(cmsContent)
      .innerJoin(cmsVariant, eq(cmsVariant.contentId, cmsContent.id))
      .innerJoin(cmsRevision, eq(cmsRevision.id, cmsVariant.draftRevisionId))
      .where(base);
    const parent =
      query.parentId === undefined
        ? undefined
        : query.parentId === "root"
          ? or(
              isNull(cmsPagePlacement.parentId),
              sql`not exists (select 1 from club.cms_variant parent_language where parent_language.content_id = ${cmsPagePlacement.parentId} and parent_language.locale = ${query.locale})`,
            )
          : eq(cmsPagePlacement.parentId, query.parentId);
    const where = and(
      base,
      stateCondition(query.status),
      search,
      parent,
      query.id ? eq(cmsContent.id, query.id) : undefined,
    );
    const [totalRow] = await tx
      .select({ total: count() })
      .from(cmsContent)
      .innerJoin(cmsVariant, eq(cmsVariant.contentId, cmsContent.id))
      .innerJoin(cmsRevision, eq(cmsRevision.id, cmsVariant.draftRevisionId))
      .leftJoin(cmsPagePlacement, eq(cmsPagePlacement.contentId, cmsContent.id))
      .where(where);
    const total = totalRow.total;
    const page = Math.min(
      query.page,
      Math.max(1, Math.ceil(total / query.pageSize)),
    );
    const order =
      query.sort === "title"
        ? asc(cmsRevision.title)
        : query.sort === "created"
          ? desc(cmsContent.createdAt)
          : query.sort === "order"
            ? asc(sql`coalesce(${cmsPagePlacement.position}, 0)`)
            : desc(cmsRevision.createdAt);
    const rows = await from()
      .where(where)
      .orderBy(order, asc(cmsContent.id))
      .limit(query.pageSize)
      .offset((page - 1) * query.pageSize);
    return {
      items: rows.map(({ archivedAt, updatedAt, kit: rawKit, ...row }) => ({
        ...row,
        kitId: kitIdSchema.safeParse(rawKit).data,
        archived: archivedAt !== null,
        updatedAt: updatedAt.toISOString(),
        isHomepage: row.id === settings?.homePageId,
        position: row.position ?? 0,
        placementVersion: row.placementVersion ?? 0,
      })),
      page,
      pageSize: query.pageSize,
      total,
      counts: grouped[0],
    };
  }

  async savePattern(actor: TrustedActor, input: unknown) {
    const values = patternSaveSchema.parse(input);
    const saved = await this.db.transaction((tx) =>
      this.savePatternDraft(actor, values, tx),
    );
    return this.cms.detail(actor, saved.id, values.locale);
  }

  async savePatternDraft(actor: TrustedActor, input: unknown, tx: Transaction) {
    const values = patternSaveSchema.parse(input);
    const { organizationId } = await this.authorization.lock(
      actor,
      "cms.edit",
      tx,
    );
    const id = await this.cms.createDraft(
      actor,
      { kind: "section", title: values.title, locale: values.locale },
      tx,
    );
    const variant = await this.repository.variant(
      organizationId,
      id,
      values.locale,
      tx,
    );
    if (!variant?.draftRevisionId)
      throw new DomainError(
        "CONTENT_NOT_FOUND",
        "The new section is unavailable.",
        404,
      );
    const revision = await this.repository.revision(
      variant.id,
      variant.draftRevisionId,
      tx,
    );
    if (!revision)
      throw new DomainError(
        "CONTENT_NOT_FOUND",
        "The new section is unavailable.",
        404,
      );
    await this.cms.drafts.save(
      actor,
      {
        id,
        locale: values.locale,
        expectedRevisionId: revision.id,
        title: values.title,
        slug: revision.slug,
        description: "",
        socialImageId: null,
        data: values.data,
      },
      tx,
      "cms.pattern.saved",
    );
    const saved = await this.repository.variant(
      organizationId,
      id,
      values.locale,
      tx,
    );
    if (!saved?.draftRevisionId) this.unavailable();
    return { id, revisionId: saved.draftRevisionId };
  }

  async quickEdit(actor: TrustedActor, input: unknown) {
    const values = quickEditSchema.parse(input);
    await this.db.transaction((tx) => this.quickEditDraft(actor, values, tx));
    return this.cms.detail(actor, values.id, values.locale);
  }

  async quickEditDraft(actor: TrustedActor, input: unknown, tx: Transaction) {
    const values = quickEditSchema.parse(input);
    const { organizationId } = await this.authorization.lock(
      actor,
      "cms.edit",
      tx,
    );
    const content = await this.repository.content(
      organizationId,
      values.id,
      tx,
    );
    const variant = await this.repository.variant(
      organizationId,
      values.id,
      values.locale,
      tx,
    );
    const revision =
      variant &&
      (await this.repository.revision(
        variant.id,
        values.expectedRevisionId,
        tx,
      ));
    if (
      !content ||
      content.eventId ||
      !variant ||
      !revision ||
      !["page", "section"].includes(content.kind)
    )
      this.unavailable();
    if (
      content.archivedAt ||
      variant.draftRevisionId !== values.expectedRevisionId
    )
      this.conflict();
    const [placement] = await tx
      .select()
      .from(cmsPagePlacement)
      .where(eq(cmsPagePlacement.contentId, content.id));
    if ((placement?.version ?? 0) !== values.expectedPlacementVersion)
      this.conflict();
    if (values.parentId && content.kind !== "page")
      throw new DomainError(
        "PAGE_PARENT_ONLY",
        "Only pages can have a parent.",
        422,
      );
    await this.validateParent(tx, organizationId, content.id, values.parentId);
    const draft = revisionDto(revision, content.kind);
    if (values.title !== draft.title || values.slug !== draft.slug)
      await this.cms.drafts.save(
        actor,
        {
          id: values.id,
          locale: values.locale,
          expectedRevisionId: values.expectedRevisionId,
          title: values.title,
          slug: values.slug,
          description: draft.description,
          socialImageId: draft.socialImageId,
          data: draft.data,
        },
        tx,
      );
    await tx
      .insert(cmsPagePlacement)
      .values({
        contentId: content.id,
        organizationId,
        parentId: values.parentId,
        position: values.position,
      })
      .onConflictDoUpdate({
        target: cmsPagePlacement.contentId,
        set: {
          parentId: values.parentId,
          position: values.position,
          version: (placement?.version ?? 0) + 1,
        },
      });
    await new AuditRepository().record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action: "cms.page.organized",
      targetId: content.id,
    });
    const saved = await this.repository.variant(
      organizationId,
      values.id,
      values.locale,
      tx,
    );
    if (!saved?.draftRevisionId) this.unavailable();
    return {
      id: values.id,
      revisionId: saved.draftRevisionId,
      placementVersion: (placement?.version ?? 0) + 1,
    };
  }

  private async validateParent(
    tx: Transaction,
    organizationId: string,
    id: string,
    parentId: string | null,
  ) {
    const seen = new Set([id]);
    let parent = parentId;
    while (parent) {
      if (seen.has(parent))
        throw new DomainError(
          "PAGE_HIERARCHY_CYCLE",
          "A page cannot be placed inside itself or one of its children.",
          422,
        );
      seen.add(parent);
      const page = await this.repository.content(organizationId, parent, tx);
      if (!page || page.kind !== "page" || page.eventId || page.archivedAt)
        throw new DomainError(
          "PAGE_PARENT_UNAVAILABLE",
          "Choose an active website page as the parent.",
          422,
        );
      const [placement] = await tx
        .select({ parentId: cmsPagePlacement.parentId })
        .from(cmsPagePlacement)
        .where(eq(cmsPagePlacement.contentId, parent));
      parent = placement?.parentId ?? null;
    }
  }

  async batch(actor: TrustedActor, input: unknown, executor?: Transaction) {
    const values = pageBatchSchema.parse(input);
    if (
      new Set(values.items.map((item) => item.id)).size !== values.items.length
    )
      throw new DomainError(
        "DUPLICATE_PAGE",
        "Select each page once. Archive and restore apply to every language.",
        422,
      );
    const apply = async (tx: Transaction) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.publish",
        tx,
      );
      for (const item of values.items) {
        const content = await this.repository.content(
          organizationId,
          item.id,
          tx,
        );
        const variant = await this.repository.variant(
          organizationId,
          item.id,
          item.locale,
          tx,
        );
        if (
          !content ||
          content.eventId ||
          !["page", "section"].includes(content.kind)
        )
          this.unavailable();
        if (
          !variant ||
          variant.draftRevisionId !== item.expectedRevisionId ||
          Boolean(content.archivedAt) !== item.archived
        )
          this.conflict();
      }
      for (const item of values.items) {
        const command = {
          id: item.id,
          locale: item.locale,
          expectedRevisionId: item.expectedRevisionId,
        };
        if (values.action === "publish")
          await this.cms.publishRevision(actor, command, tx);
        else if (values.action === "unpublish")
          await this.cms.unpublishRevision(actor, command, tx);
        else if (values.action === "archive")
          await this.cms.archiveContent(actor, command, tx);
        else {
          if (!item.archived)
            throw new DomainError(
              "PAGE_NOT_ARCHIVED",
              "Only archived pages can be restored.",
              409,
            );
          await tx
            .update(cmsContent)
            .set({ archivedAt: null })
            .where(
              and(
                eq(cmsContent.id, item.id),
                eq(cmsContent.organizationId, organizationId),
              ),
            );
          await new AuditRepository().record(tx, {
            organizationId,
            actorUserId: actor.userId,
            action: "cms.archive.restored",
            targetId: item.id,
          });
        }
      }
    };
    if (executor) await apply(executor);
    else await this.db.transaction(apply);
    return { updated: values.items.length };
  }
  private unavailable(): never {
    throw new DomainError(
      "CONTENT_NOT_FOUND",
      "One of these pages is unavailable.",
      404,
    );
  }
  private conflict(): never {
    throw new DomainError(
      "REVISION_CONFLICT",
      "A selected page changed. Refresh the list and review your selection before trying again.",
      409,
    );
  }
}
