import "server-only";
import { and, count, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { collectionPage } from "@/core/collections";
import { alias } from "drizzle-orm/pg-core";
import { kitIdSchema } from "./kits/catalogue";
import { installation } from "../../../db/schema/club";
import {
  cmsContent,
  cmsRevision,
  cmsSite,
  cmsVariant,
} from "../../../db/schema/cms";
import type { Database } from "../../infrastructure/database/client";
import type { DatabaseExecutor } from "../../core/authorization/AuthorizationService";
import { type CmsLocale, type CmsSummary } from "./cms_schemas";

export class CmsRepository {
  constructor(private readonly db: Database) {}

  async organizationId(
    executor: DatabaseExecutor = this.db,
  ): Promise<string | null> {
    const [row] = await executor
      .select({ id: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    return row?.id ?? null;
  }

  async list(
    organizationId: string,
    executor: DatabaseExecutor = this.db,
    eventId?: string,
  ): Promise<CmsSummary[]> {
    const liveRevision = alias(cmsRevision, "summary_live_revision");
    const rows = await executor
      .select({
        id: cmsContent.id,
        kind: cmsContent.kind,
        moduleKey: cmsContent.moduleKey,
        locale: cmsVariant.locale,
        title: cmsRevision.title,
        slug: cmsRevision.slug,
        draftRevisionId: cmsRevision.id,
        publishedRevisionId: cmsVariant.publishedRevisionId,
        archivedAt: cmsContent.archivedAt,
        updatedAt: cmsRevision.createdAt,
        liveSlug: liveRevision.slug,
        homePageId: sql<string | null>`${cmsSite.published}->>'homePageId'`,
        kit: sql<string | null>`${cmsRevision.data}->'root'->'props'->>'kit'`,
        demonstration: sql<boolean>`coalesce((${cmsRevision.data}->'root'->'props'->>'demonstration')::boolean, false)`,
      })
      .from(cmsContent)
      .innerJoin(cmsVariant, eq(cmsVariant.contentId, cmsContent.id))
      .innerJoin(cmsRevision, eq(cmsRevision.id, cmsVariant.draftRevisionId))
      .leftJoin(
        liveRevision,
        eq(liveRevision.id, cmsVariant.publishedRevisionId),
      )
      .leftJoin(
        cmsSite,
        and(
          eq(cmsSite.organizationId, cmsContent.organizationId),
          eq(cmsSite.locale, cmsVariant.locale),
        ),
      )
      .where(
        and(
          eq(cmsContent.organizationId, organizationId),
          eventId
            ? eq(cmsContent.eventId, eventId)
            : isNull(cmsContent.eventId),
        ),
      )
      .orderBy(cmsContent.createdAt, cmsContent.id, cmsVariant.locale);
    return rows.map(
      ({ archivedAt, updatedAt, liveSlug, homePageId, kit, ...row }) => ({
        ...row,
        kitId: kitIdSchema.safeParse(kit).data,
        archived: archivedAt !== null,
        updatedAt: updatedAt.toISOString(),
        isHomepage:
          row.kind === "page" &&
          archivedAt === null &&
          row.publishedRevisionId !== null &&
          (homePageId ? homePageId === row.id : liveSlug === "home"),
      }),
    );
  }

  async content(
    organizationId: string,
    id: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select()
      .from(cmsContent)
      .where(
        and(
          eq(cmsContent.id, id),
          eq(cmsContent.organizationId, organizationId),
        ),
      );
    return row;
  }

  async variant(
    organizationId: string,
    contentId: string,
    locale: CmsLocale,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select()
      .from(cmsVariant)
      .where(
        and(
          eq(cmsVariant.organizationId, organizationId),
          eq(cmsVariant.contentId, contentId),
          eq(cmsVariant.locale, locale),
        ),
      );
    return row;
  }

  async variants(
    organizationId: string,
    contentId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    return executor
      .select()
      .from(cmsVariant)
      .where(
        and(
          eq(cmsVariant.organizationId, organizationId),
          eq(cmsVariant.contentId, contentId),
        ),
      );
  }

  async revision(
    variantId: string,
    id: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select()
      .from(cmsRevision)
      .where(and(eq(cmsRevision.id, id), eq(cmsRevision.variantId, variantId)));
    return row;
  }

  async revisions(
    variantId: string,
    executor: DatabaseExecutor = this.db,
    requestedPage = 1,
    pageSize = 30,
  ) {
    const where = eq(cmsRevision.variantId, variantId);
    const [summary] = await executor
      .select({ total: count() })
      .from(cmsRevision)
      .where(where);
    const total = summary.total;
    const page = collectionPage(total, requestedPage, pageSize);
    const rows = await executor
      .select({
        id: cmsRevision.id,
        title: cmsRevision.title,
        createdAt: cmsRevision.createdAt,
      })
      .from(cmsRevision)
      .where(where)
      .orderBy(desc(cmsRevision.createdAt), desc(cmsRevision.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return {
      revisions: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async published(
    organizationId: string,
    locale?: CmsLocale,
    executor: DatabaseExecutor = this.db,
    eventId?: string,
  ) {
    return executor
      .select({
        id: cmsContent.id,
        kind: cmsContent.kind,
        moduleKey: cmsContent.moduleKey,
        variantId: cmsVariant.id,
        locale: cmsVariant.locale,
        revision: cmsRevision,
      })
      .from(cmsContent)
      .innerJoin(cmsVariant, eq(cmsVariant.contentId, cmsContent.id))
      .innerJoin(
        cmsRevision,
        eq(cmsRevision.id, cmsVariant.publishedRevisionId),
      )
      .where(
        and(
          eq(cmsContent.organizationId, organizationId),
          eventId
            ? eq(cmsContent.eventId, eventId)
            : isNull(cmsContent.eventId),
          isNull(cmsContent.archivedAt),
          isNotNull(cmsVariant.publishedRevisionId),
          locale ? eq(cmsVariant.locale, locale) : undefined,
        ),
      );
  }

  async appearanceDocuments(
    organizationId: string,
    locale: CmsLocale,
    executor: DatabaseExecutor,
  ) {
    return executor
      .select({
        eventId: cmsContent.eventId,
        title: cmsRevision.title,
        kind: cmsContent.kind,
        data: cmsRevision.data,
      })
      .from(cmsContent)
      .innerJoin(cmsVariant, eq(cmsVariant.contentId, cmsContent.id))
      .innerJoin(
        cmsRevision,
        or(
          eq(cmsRevision.id, cmsVariant.draftRevisionId),
          eq(cmsRevision.id, cmsVariant.publishedRevisionId),
        ),
      )
      .where(
        and(
          eq(cmsContent.organizationId, organizationId),
          eq(cmsVariant.locale, locale),
          isNull(cmsContent.archivedAt),
        ),
      );
  }

  async site(
    organizationId: string,
    locale: CmsLocale,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select()
      .from(cmsSite)
      .where(
        and(
          eq(cmsSite.organizationId, organizationId),
          eq(cmsSite.locale, locale),
        ),
      );
    return row;
  }

  async homeWasPublished(
    organizationId: string,
    locale: CmsLocale,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: cmsVariant.id })
      .from(cmsVariant)
      .where(
        and(
          eq(cmsVariant.organizationId, organizationId),
          eq(cmsVariant.locale, locale),
          eq(cmsVariant.homeEverPublished, true),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}
