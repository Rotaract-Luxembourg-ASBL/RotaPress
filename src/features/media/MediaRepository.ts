import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { installation } from "../../../db/schema/club";
import {
  automationMediaUpload,
  mediaAsset,
  mediaUsage,
} from "../../../db/schema/media";
import type {
  DatabaseExecutor,
  Transaction,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { MediaAssetDto, MediaMetadata } from "./media_schemas";

export const mediaProjection = {
  id: mediaAsset.id,
  kind: mediaAsset.kind,
  mimeType: mediaAsset.mimeType,
  visibility: mediaAsset.visibility,
  originalName: mediaAsset.originalName,
  size: mediaAsset.size,
  width: mediaAsset.width,
  height: mediaAsset.height,
  title: mediaAsset.title,
  alt: mediaAsset.alt,
  caption: mediaAsset.caption,
  tags: mediaAsset.tags,
  collection: mediaAsset.collection,
  createdAt: mediaAsset.createdAt,
};

export function mediaAssetDto(
  row: Omit<MediaAssetDto, "createdAt"> & { createdAt: Date },
): MediaAssetDto {
  // The database's kind/mime/dimension constraints enforce this discriminated union.
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  } as MediaAssetDto;
}

export class MediaRepository {
  constructor(private readonly db: Database) {}

  /** Cleanup must not delete bytes after a committed write whose response failed. */
  async storageReferenced(storageKey: string) {
    const [row] = await this.db
      .select({ id: mediaAsset.id })
      .from(mediaAsset)
      .where(eq(mediaAsset.storageKey, storageKey))
      .limit(1);
    return Boolean(row);
  }

  async asset(
    id: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select({ ...mediaProjection, storageKey: mediaAsset.storageKey })
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.id, id),
          eq(mediaAsset.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async installedAsset(id: string) {
    const [row] = await this.db
      .select({
        id: mediaAsset.id,
        organizationId: mediaAsset.organizationId,
        storageKey: mediaAsset.storageKey,
        visibility: mediaAsset.visibility,
        kind: mediaAsset.kind,
        mimeType: mediaAsset.mimeType,
        size: mediaAsset.size,
        originalName: mediaAsset.originalName,
      })
      .from(installation)
      .innerJoin(
        mediaAsset,
        eq(mediaAsset.organizationId, installation.organizationId),
      )
      .where(and(eq(installation.id, 1), eq(mediaAsset.id, id)))
      .limit(1);
    return row ?? null;
  }

  async insert(
    input: typeof mediaAsset.$inferInsert,
    tx: Transaction,
  ): Promise<MediaAssetDto> {
    const [created] = await tx
      .insert(mediaAsset)
      .values(input)
      .returning(mediaProjection);
    return mediaAssetDto(created);
  }

  async uploadReceipt(
    organizationId: string,
    requestId: string,
    tx: Transaction,
  ) {
    const [receipt] = await tx
      .select()
      .from(automationMediaUpload)
      .where(
        and(
          eq(automationMediaUpload.organizationId, organizationId),
          eq(automationMediaUpload.requestId, requestId),
        ),
      )
      .limit(1);
    return receipt ?? null;
  }

  async recordUpload(
    input: typeof automationMediaUpload.$inferInsert,
    tx: Transaction,
  ) {
    await tx.insert(automationMediaUpload).values(input);
  }

  async details(
    id: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<MediaAssetDto | null> {
    const [row] = await executor
      .select(mediaProjection)
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.id, id),
          eq(mediaAsset.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ? mediaAssetDto(row) : null;
  }

  async update(
    id: string,
    organizationId: string,
    values: MediaMetadata & { visibility: "private" | "public" },
    tx: Transaction,
  ): Promise<MediaAssetDto> {
    const [updated] = await tx
      .update(mediaAsset)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(mediaAsset.id, id),
          eq(mediaAsset.organizationId, organizationId),
        ),
      )
      .returning(mediaProjection);
    return mediaAssetDto(updated);
  }

  async batchAssets(ids: string[], organizationId: string, tx: Transaction) {
    const rows = await tx
      .select({ ...mediaProjection, storageKey: mediaAsset.storageKey })
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.organizationId, organizationId),
          inArray(mediaAsset.id, ids),
        ),
      );
    return rows.map((row) => ({
      ...mediaAssetDto(row),
      storageKey: row.storageKey,
    }));
  }

  async usedAssetIds(
    ids: string[],
    organizationId: string,
    tx: Transaction,
    publishedOnly = false,
  ) {
    const rows = await tx
      .selectDistinct({ id: mediaUsage.assetId })
      .from(mediaUsage)
      .where(
        and(
          eq(mediaUsage.organizationId, organizationId),
          inArray(mediaUsage.assetId, ids),
          publishedOnly ? eq(mediaUsage.published, true) : undefined,
        ),
      );
    return new Set(rows.map((row) => row.id));
  }

  async updateSelection(
    ids: string[],
    organizationId: string,
    values: Partial<MediaMetadata> & { visibility?: "private" | "public" },
    tx: Transaction,
  ) {
    if (!ids.length) return [];
    const rows = await tx
      .update(mediaAsset)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(mediaAsset.organizationId, organizationId),
          inArray(mediaAsset.id, ids),
        ),
      )
      .returning(mediaProjection);
    return rows.map(mediaAssetDto);
  }

  async deleteSelection(
    ids: string[],
    organizationId: string,
    tx: Transaction,
  ) {
    await tx
      .delete(mediaAsset)
      .where(
        and(
          eq(mediaAsset.organizationId, organizationId),
          inArray(mediaAsset.id, ids),
        ),
      );
  }

  async delete(
    id: string,
    organizationId: string,
    tx: Transaction,
  ): Promise<void> {
    await tx
      .delete(mediaAsset)
      .where(
        and(
          eq(mediaAsset.id, id),
          eq(mediaAsset.organizationId, organizationId),
        ),
      );
  }

  async used(
    id: string,
    organizationId: string,
    tx: Transaction,
    publishedOnly = false,
  ): Promise<boolean> {
    const [reference] = await tx
      .select({ id: mediaUsage.assetId })
      .from(mediaUsage)
      .where(
        and(
          eq(mediaUsage.assetId, id),
          eq(mediaUsage.organizationId, organizationId),
          publishedOnly ? eq(mediaUsage.published, true) : undefined,
        ),
      )
      .limit(1);
    return !!reference;
  }

  async usage(
    id: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    return executor
      .select({ published: mediaUsage.published, references: count() })
      .from(mediaUsage)
      .where(
        and(
          eq(mediaUsage.assetId, id),
          eq(mediaUsage.organizationId, organizationId),
        ),
      )
      .groupBy(mediaUsage.published);
  }

  async references(
    organizationId: string,
    ids: string[],
    executor: DatabaseExecutor,
  ) {
    if (!ids.length) return [];
    return executor
      .select({
        id: mediaAsset.id,
        visibility: mediaAsset.visibility,
        title: mediaAsset.title,
        originalName: mediaAsset.originalName,
        kind: mediaAsset.kind,
      })
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.organizationId, organizationId),
          inArray(mediaAsset.id, ids),
        ),
      );
  }

  async replaceUsage(
    ownerKey: string,
    organizationId: string,
    ids: string[],
    tx: Transaction,
    published: boolean,
  ): Promise<void> {
    await tx
      .delete(mediaUsage)
      .where(
        and(
          eq(mediaUsage.ownerKey, ownerKey),
          eq(mediaUsage.organizationId, organizationId),
        ),
      );
    if (ids.length)
      await tx.insert(mediaUsage).values(
        ids.map((assetId) => ({
          ownerKey,
          organizationId,
          assetId,
          published,
        })),
      );
  }
}
