import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { installation } from "../../../db/schema/club";
import { mediaAsset, mediaUsage } from "../../../db/schema/media";
import type { DatabaseExecutor, Transaction } from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { MediaAssetDto, MediaMetadata } from "./media_schemas";

const projection = {
  id: mediaAsset.id,
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

function dto(row: Omit<MediaAssetDto, "createdAt" | "mimeType"> & { createdAt: Date }): MediaAssetDto {
  return { ...row, createdAt: row.createdAt.toISOString(), mimeType: "image/webp" };
}

export class MediaRepository {
  constructor(private readonly db: Database) {}

  async list(organizationId: string, publicOnly = false): Promise<MediaAssetDto[]> {
    const rows = await this.db.select(projection).from(mediaAsset)
      .where(and(eq(mediaAsset.organizationId, organizationId), publicOnly ? eq(mediaAsset.visibility, "public") : undefined)).orderBy(desc(mediaAsset.createdAt)).limit(250);
    return rows.map(dto);
  }

  async asset(id: string, organizationId: string, executor: DatabaseExecutor = this.db) {
    const [row] = await executor.select({ ...projection, storageKey: mediaAsset.storageKey }).from(mediaAsset)
      .where(and(eq(mediaAsset.id, id), eq(mediaAsset.organizationId, organizationId))).limit(1);
    return row ?? null;
  }

  async installedAsset(id: string) {
    const [row] = await this.db.select({
      id: mediaAsset.id, organizationId: mediaAsset.organizationId,
      storageKey: mediaAsset.storageKey, visibility: mediaAsset.visibility,
    }).from(installation).innerJoin(mediaAsset, eq(mediaAsset.organizationId, installation.organizationId))
      .where(and(eq(installation.id, 1), eq(mediaAsset.id, id))).limit(1);
    return row ?? null;
  }

  async insert(input: typeof mediaAsset.$inferInsert, tx: Transaction): Promise<MediaAssetDto> {
    const [created] = await tx.insert(mediaAsset).values(input).returning(projection);
    return dto(created);
  }

  async details(id: string, organizationId: string): Promise<MediaAssetDto | null> {
    const [row] = await this.db.select(projection).from(mediaAsset)
      .where(and(eq(mediaAsset.id, id), eq(mediaAsset.organizationId, organizationId))).limit(1);
    return row ? dto(row) : null;
  }

  async update(id: string, organizationId: string, values: MediaMetadata & { visibility: "private" | "public" }, tx: Transaction): Promise<MediaAssetDto> {
    const [updated] = await tx.update(mediaAsset).set({ ...values, updatedAt: new Date() })
      .where(and(eq(mediaAsset.id, id), eq(mediaAsset.organizationId, organizationId))).returning(projection);
    return dto(updated);
  }

  async delete(id: string, organizationId: string, tx: Transaction): Promise<void> {
    await tx.delete(mediaAsset).where(and(eq(mediaAsset.id, id), eq(mediaAsset.organizationId, organizationId)));
  }

  async used(id: string, organizationId: string, tx: Transaction, publishedOnly = false): Promise<boolean> {
    const [reference] = await tx.select({ id: mediaUsage.assetId }).from(mediaUsage).where(and(
      eq(mediaUsage.assetId, id), eq(mediaUsage.organizationId, organizationId),
      publishedOnly ? eq(mediaUsage.published, true) : undefined,
    )).limit(1);
    return !!reference;
  }

  async usage(id: string, organizationId: string) {
    return this.db.select({ published: mediaUsage.published, references: count() }).from(mediaUsage)
      .where(and(eq(mediaUsage.assetId, id), eq(mediaUsage.organizationId, organizationId)))
      .groupBy(mediaUsage.published);
  }

  async references(organizationId: string, ids: string[], executor: DatabaseExecutor) {
    if (!ids.length) return [];
    return executor.select({ id: mediaAsset.id, visibility: mediaAsset.visibility, title: mediaAsset.title, originalName: mediaAsset.originalName }).from(mediaAsset)
      .where(and(eq(mediaAsset.organizationId, organizationId), inArray(mediaAsset.id, ids)));
  }

  async replaceUsage(ownerKey: string, organizationId: string, ids: string[], tx: Transaction, published: boolean): Promise<void> {
    await tx.delete(mediaUsage).where(and(eq(mediaUsage.ownerKey, ownerKey), eq(mediaUsage.organizationId, organizationId)));
    if (ids.length) await tx.insert(mediaUsage).values(ids.map((assetId) => ({ ownerKey, organizationId, assetId, published })));
  }
}
