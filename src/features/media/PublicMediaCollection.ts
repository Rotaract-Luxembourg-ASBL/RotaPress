import "server-only";
import { z } from "zod";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { mediaAsset } from "../../../db/schema/media";
import type { Database } from "@/infrastructure/database/client";
import { mediaAdminListSchema } from "./media_schemas";
import { mediaAssetDto, mediaProjection } from "./MediaRepository";

const querySchema = z.object({
  id: z.uuid().optional(),
  page: mediaAdminListSchema.shape.page,
  pageSize: mediaAdminListSchema.shape.pageSize,
  search: mediaAdminListSchema.shape.search,
  sort: mediaAdminListSchema.shape.sort,
  kind: mediaAdminListSchema.shape.kind,
});

/** Event editors browse public assets without private counts or internal metadata. */
export class PublicMediaCollection {
  constructor(private readonly db: Database) {}

  async list(organizationId: string, input: unknown) {
    const query = querySchema.parse(input);
    const pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
    const where = and(
      eq(mediaAsset.organizationId, organizationId),
      eq(mediaAsset.visibility, "public"),
      query.id ? eq(mediaAsset.id, query.id) : undefined,
      query.kind === "all" ? undefined : eq(mediaAsset.kind, query.kind),
      query.search
        ? or(
            ilike(mediaAsset.title, pattern),
            ilike(mediaAsset.alt, pattern),
            ilike(mediaAsset.caption, pattern),
          )
        : undefined,
    );
    return this.db.transaction(
      async (tx) => {
        const [summary] = await tx
          .select({ total: count() })
          .from(mediaAsset)
          .where(where);
        const page = Math.min(
          query.page,
          Math.max(1, Math.ceil(summary.total / query.pageSize)),
        );
        const order =
          query.sort === "oldest"
            ? asc(mediaAsset.createdAt)
            : query.sort === "title"
              ? asc(sql`lower(${mediaAsset.title})`)
              : desc(mediaAsset.createdAt);
        const rows = await tx
          .select(mediaProjection)
          .from(mediaAsset)
          .where(where)
          .orderBy(order, asc(mediaAsset.id))
          .limit(query.pageSize)
          .offset((page - 1) * query.pageSize);
        return {
          assets: rows.map((row) => ({
            ...mediaAssetDto(row),
            originalName: row.title || "Public file",
            tags: [],
            collection: "",
          })),
          total: summary.total,
          page,
          pageSize: query.pageSize,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
