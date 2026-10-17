import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  mediaAlbum,
  mediaAlbumRevision,
  mediaAlbumUsage,
} from "../../../db/schema/media-albums";
import {
  DomainError,
  type DatabaseExecutor,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { albumDataSchema } from "./album_schemas";

const idsSchema = z
  .array(z.uuid())
  .max(500)
  .transform((ids) => [...new Set(ids)]);

/** Public projection resolves the current published revision of linked albums. */
export class AlbumReader {
  constructor(private readonly db: Database) {}

  async published(
    organizationId: string,
    id: string,
    executor: DatabaseExecutor = this.db,
  ) {
    return (
      (await this.publishedMany(organizationId, [id], executor))[0] ?? null
    );
  }

  async publishedMany(
    organizationId: string,
    inputIds: string[],
    executor: DatabaseExecutor = this.db,
  ) {
    const ids = idsSchema.parse(inputIds);
    if (!ids.length) return [];
    const rows = await executor
      .select({
        id: mediaAlbum.id,
        revisionId: mediaAlbumRevision.id,
        data: mediaAlbumRevision.data,
      })
      .from(mediaAlbum)
      .innerJoin(
        mediaAlbumRevision,
        and(
          eq(mediaAlbum.publishedRevisionId, mediaAlbumRevision.id),
          eq(mediaAlbum.id, mediaAlbumRevision.albumId),
          eq(mediaAlbum.organizationId, mediaAlbumRevision.organizationId),
        ),
      )
      .where(
        and(
          eq(mediaAlbum.organizationId, organizationId),
          inArray(mediaAlbum.id, ids),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      revisionId: row.revisionId,
      ...albumDataSchema.parse(row.data),
    }));
  }

  async assertReferences(
    organizationId: string,
    inputIds: string[],
    published: boolean,
    executor: DatabaseExecutor = this.db,
  ) {
    const ids = idsSchema.parse(inputIds);
    if (!ids.length) return;
    const rows = await executor
      .select({
        id: mediaAlbum.id,
        publishedRevisionId: mediaAlbum.publishedRevisionId,
      })
      .from(mediaAlbum)
      .where(
        and(
          eq(mediaAlbum.organizationId, organizationId),
          inArray(mediaAlbum.id, ids),
        ),
      );
    if (rows.length !== ids.length)
      throw new DomainError(
        "ALBUM_NOT_FOUND",
        "Choose an album from this club.",
        422,
      );
    if (published && rows.some((row) => !row.publishedRevisionId))
      throw new DomainError(
        "ALBUM_NOT_PUBLISHED",
        "Publish each linked album before publishing this page.",
        422,
      );
  }

  async replaceUsage(
    ownerKey: string,
    organizationId: string,
    inputIds: string[],
    tx: Transaction,
    published = false,
  ) {
    const ids = idsSchema.parse(inputIds);
    z.string().min(1).max(160).parse(ownerKey);
    await this.assertReferences(organizationId, ids, published, tx);
    await tx
      .delete(mediaAlbumUsage)
      .where(
        and(
          eq(mediaAlbumUsage.organizationId, organizationId),
          eq(mediaAlbumUsage.ownerKey, ownerKey),
        ),
      );
    if (ids.length)
      await tx.insert(mediaAlbumUsage).values(
        ids.map((albumId) => ({
          organizationId,
          ownerKey,
          albumId,
          published,
        })),
      );
  }
}
