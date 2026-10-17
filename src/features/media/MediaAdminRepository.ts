import "server-only";
import { and, asc, count, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { mediaAsset } from "../../../db/schema/media";
import type { Database } from "../../infrastructure/database/client";
import { mediaAssetDto, mediaProjection } from "./MediaRepository";
import { adminMediaAssetDto } from "./media_admin";
import type { MediaAdminListInput } from "./media_schemas";

/** Administration can reach the complete library without widening automation outputs. */
export class MediaAdminRepository {
  constructor(private readonly db: Database) {}

  async list(organizationId: string, input: MediaAdminListInput) {
    const pattern = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
    const filters = and(
      eq(mediaAsset.organizationId, organizationId),
      input.kind === "all" ? undefined : eq(mediaAsset.kind, input.kind),
      input.visibility === "all" ? undefined : eq(mediaAsset.visibility, input.visibility),
      input.collection ? eq(mediaAsset.collection, input.collection) : undefined,
      input.search ? or(
        ilike(mediaAsset.title, pattern), ilike(mediaAsset.originalName, pattern),
        ilike(mediaAsset.alt, pattern), ilike(mediaAsset.caption, pattern),
        ilike(mediaAsset.collection, pattern),
        sql`${mediaAsset.tags}::text ilike ${pattern}`,
      ) : undefined,
      input.dateFrom ? gte(mediaAsset.createdAt, new Date(`${input.dateFrom}T00:00:00.000Z`)) : undefined,
      input.dateTo ? lt(mediaAsset.createdAt, new Date(new Date(`${input.dateTo}T00:00:00.000Z`).getTime() + 86_400_000)) : undefined,
    );
    return this.db.transaction(async (tx) => {
      const [summary] = await tx.select({
        all: count(),
        public: sql<number>`count(*) filter (where ${mediaAsset.visibility} = 'public')`.mapWith(Number),
        private: sql<number>`count(*) filter (where ${mediaAsset.visibility} = 'private')`.mapWith(Number),
      }).from(mediaAsset).where(and(eq(mediaAsset.organizationId, organizationId),
        input.kind === "all" ? undefined : eq(mediaAsset.kind, input.kind)));
      const [matched] = await tx.select({ total: count() }).from(mediaAsset).where(filters);
      const collections = await tx.selectDistinct({ collection: mediaAsset.collection })
        .from(mediaAsset).where(eq(mediaAsset.organizationId, organizationId))
        .orderBy(asc(mediaAsset.collection));
      const page = Math.min(input.page, Math.max(1, Math.ceil(matched.total / input.pageSize)));
      const order = input.sort === "oldest" ? asc(mediaAsset.createdAt)
        : input.sort === "title" ? asc(sql`lower(coalesce(nullif(${mediaAsset.title}, ''), ${mediaAsset.originalName}))`)
        : desc(mediaAsset.createdAt);
      const rows = await tx.select(mediaProjection).from(mediaAsset).where(filters)
        .orderBy(order, asc(mediaAsset.id)).limit(input.pageSize)
        .offset(input.offset ?? (page - 1) * input.pageSize);
      return {
        assets: rows.map((row) => adminMediaAssetDto(mediaAssetDto(row))),
        total: matched.total, page, pageSize: input.pageSize,
        counts: summary,
        collections: collections.map((row) => row.collection).filter(Boolean),
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }
}
