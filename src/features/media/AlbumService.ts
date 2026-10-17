import "server-only";
import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import {
  mediaAlbum,
  mediaAlbumRevision,
  mediaAlbumUsage,
} from "../../../db/schema/media-albums";
import { mediaUsage } from "../../../db/schema/media";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { MediaService } from "./MediaService";
import {
  albumDataSchema,
  albumListSchema,
  albumSaveSchema,
  albumVersionSchema,
  type AlbumCollection,
  type AlbumData,
  type AlbumDetail,
} from "./album_schemas";

export class AlbumService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly media: MediaService,
  ) {}

  async list(actor: TrustedActor, input: unknown): Promise<AlbumCollection> {
    const parsed = albumListSchema.parse(input);
    return this.db.transaction(
      async (tx) => {
        const scope = await this.authorization.require(
          actor,
          "media.manage",
          tx,
        );
        const filter = and(
          eq(mediaAlbum.organizationId, scope.organizationId),
          parsed.search
            ? ilike(
                sql`${mediaAlbumRevision.data}->>'title'`,
                `%${parsed.search.replace(/[\\%_]/g, "\\$&")}%`,
              )
            : undefined,
        );
        const [total] = await tx
          .select({ count: count() })
          .from(mediaAlbum)
          .innerJoin(
            mediaAlbumRevision,
            eq(mediaAlbum.draftRevisionId, mediaAlbumRevision.id),
          )
          .where(filter);
        const page = Math.min(
          parsed.page,
          Math.max(1, Math.ceil(total.count / parsed.pageSize)),
        );
        const rows = await tx
          .select({ album: mediaAlbum, data: mediaAlbumRevision.data })
          .from(mediaAlbum)
          .innerJoin(
            mediaAlbumRevision,
            eq(mediaAlbum.draftRevisionId, mediaAlbumRevision.id),
          )
          .where(filter)
          .orderBy(desc(mediaAlbum.updatedAt), desc(mediaAlbum.id))
          .limit(parsed.pageSize)
          .offset((page - 1) * parsed.pageSize);
        return {
          total: total.count,
          page,
          pageSize: parsed.pageSize,
          albums: rows.map(({ album, data }) => {
            const draft = albumDataSchema.parse(data);
            return {
              id: album.id,
              version: album.version,
              draftRevisionId: album.draftRevisionId!,
              publishedRevisionId: album.publishedRevisionId,
              updatedAt: album.updatedAt.toISOString(),
              title: draft.title,
              description: draft.description,
              imageCount: draft.items.length,
              coverAssetId: draft.items[0]?.assetId ?? null,
            };
          }),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async get(actor: TrustedActor, id: string) {
    z.uuid().parse(id);
    const scope = await this.authorization.require(actor, "media.manage");
    return this.detail(scope.organizationId, id, this.db);
  }

  async create(actor: TrustedActor, input: unknown, executor?: Transaction) {
    const data = albumDataSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const [album] = await tx
        .insert(mediaAlbum)
        .values({ organizationId: scope.organizationId })
        .returning();
      const revisionId = await this.revision(
        tx,
        scope.organizationId,
        album.id,
        actor.userId,
        data,
      );
      await tx
        .update(mediaAlbum)
        .set({ draftRevisionId: revisionId })
        .where(eq(mediaAlbum.id, album.id));
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "album.create",
        targetId: album.id,
      });
      return this.detail(scope.organizationId, album.id, tx);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  async save(
    actor: TrustedActor,
    id: string,
    input: unknown,
    executor?: Transaction,
  ) {
    z.uuid().parse(id);
    const { expectedVersion, data } = albumSaveSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const album = await this.locked(
        scope.organizationId,
        id,
        expectedVersion,
        tx,
      );
      const revisionId = await this.revision(
        tx,
        scope.organizationId,
        id,
        actor.userId,
        data,
      );
      await tx
        .update(mediaAlbum)
        .set({
          draftRevisionId: revisionId,
          version: album.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(mediaAlbum.id, id));
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "album.save",
        targetId: id,
      });
      return this.detail(scope.organizationId, id, tx);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  async publish(
    actor: TrustedActor,
    id: string,
    input: unknown,
    executor?: Transaction,
  ) {
    z.uuid().parse(id);
    const { expectedVersion } = albumVersionSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      await this.authorization.require(actor, "cms.publish", tx);
      const album = await this.locked(
        scope.organizationId,
        id,
        expectedVersion,
        tx,
      );
      const detail = await this.detail(scope.organizationId, id, tx);
      if (!detail.draft.items.length)
        throw new DomainError(
          "ALBUM_EMPTY",
          "Add photographs before publishing this album.",
          422,
        );
      await this.media.replaceUsage(
        `album:${id}:published`,
        scope.organizationId,
        detail.draft.items.map((item) => item.assetId),
        tx,
        true,
      );
      await tx
        .update(mediaAlbum)
        .set({
          publishedRevisionId: album.draftRevisionId,
          version: album.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(mediaAlbum.id, id));
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "album.publish",
        targetId: id,
      });
      return this.detail(scope.organizationId, id, tx);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  async unpublish(
    actor: TrustedActor,
    id: string,
    input: unknown,
    executor?: Transaction,
  ) {
    z.uuid().parse(id);
    const { expectedVersion } = albumVersionSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      await this.authorization.require(actor, "cms.publish", tx);
      const album = await this.locked(
        scope.organizationId,
        id,
        expectedVersion,
        tx,
      );
      const [used] = await tx
        .select({ id: mediaAlbumUsage.albumId })
        .from(mediaAlbumUsage)
        .where(
          and(
            eq(mediaAlbumUsage.organizationId, scope.organizationId),
            eq(mediaAlbumUsage.albumId, id),
            eq(mediaAlbumUsage.published, true),
          ),
        )
        .limit(1);
      if (used)
        throw new DomainError(
          "ALBUM_PUBLISHED_USE",
          "Remove this linked album from published content before unpublishing it.",
          409,
        );
      await this.media.replaceUsage(
        `album:${id}:published`,
        scope.organizationId,
        [],
        tx,
        false,
      );
      await tx
        .update(mediaAlbum)
        .set({
          publishedRevisionId: null,
          version: album.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(mediaAlbum.id, id));
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "album.unpublish",
        targetId: id,
      });
      return this.detail(scope.organizationId, id, tx);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  async delete(
    actor: TrustedActor,
    id: string,
    input: unknown,
    executor?: Transaction,
  ) {
    z.uuid().parse(id);
    const { expectedVersion } = albumVersionSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const album = await this.locked(
        scope.organizationId,
        id,
        expectedVersion,
        tx,
      );
      const [used] = await tx
        .select({ id: mediaAlbumUsage.albumId })
        .from(mediaAlbumUsage)
        .where(
          and(
            eq(mediaAlbumUsage.organizationId, scope.organizationId),
            eq(mediaAlbumUsage.albumId, id),
          ),
        )
        .limit(1);
      if (used || album.publishedRevisionId)
        throw new DomainError(
          "ALBUM_IN_USE",
          "Unpublish this album and remove retained content references before deleting it.",
          409,
        );
      await tx
        .update(mediaAlbum)
        .set({ draftRevisionId: null })
        .where(eq(mediaAlbum.id, id));
      const revisions = await tx
        .select({ id: mediaAlbumRevision.id })
        .from(mediaAlbumRevision)
        .where(
          and(
            eq(mediaAlbumRevision.organizationId, scope.organizationId),
            eq(mediaAlbumRevision.albumId, id),
          ),
        );
      for (const revision of revisions)
        await tx
          .delete(mediaUsage)
          .where(
            and(
              eq(mediaUsage.organizationId, scope.organizationId),
              eq(mediaUsage.ownerKey, `album:${id}:revision:${revision.id}`),
            ),
          );
      await tx
        .delete(mediaAlbum)
        .where(
          and(
            eq(mediaAlbum.organizationId, scope.organizationId),
            eq(mediaAlbum.id, id),
          ),
        );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "album.delete",
        targetId: id,
      });
      return { deletedId: id };
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  private async revision(
    tx: Transaction,
    organizationId: string,
    albumId: string,
    createdBy: string,
    data: AlbumData,
  ) {
    await this.media.assertAssetKinds(
      organizationId,
      data.items.map((item) => ({ id: item.assetId, kind: "image" })),
      tx,
    );
    const [revision] = await tx
      .insert(mediaAlbumRevision)
      .values({ organizationId, albumId, data, createdBy })
      .returning({ id: mediaAlbumRevision.id });
    await this.media.replaceUsage(
      `album:${albumId}:revision:${revision.id}`,
      organizationId,
      data.items.map((item) => item.assetId),
      tx,
    );
    return revision.id;
  }

  private async locked(
    organizationId: string,
    id: string,
    expectedVersion: number,
    tx: Transaction,
  ) {
    const [album] = await tx
      .select()
      .from(mediaAlbum)
      .where(
        and(
          eq(mediaAlbum.organizationId, organizationId),
          eq(mediaAlbum.id, id),
        ),
      )
      .for("update")
      .limit(1);
    if (!album)
      throw new DomainError(
        "ALBUM_NOT_FOUND",
        "This album is unavailable.",
        404,
      );
    if (album.version !== expectedVersion)
      throw new DomainError(
        "ALBUM_CHANGED",
        "This album changed. Reopen it to review the latest version before saving.",
        409,
      );
    return album;
  }

  private async detail(
    organizationId: string,
    id: string,
    executor: DatabaseExecutor,
  ): Promise<AlbumDetail> {
    const [album] = await executor
      .select()
      .from(mediaAlbum)
      .where(
        and(
          eq(mediaAlbum.organizationId, organizationId),
          eq(mediaAlbum.id, id),
        ),
      )
      .limit(1);
    if (!album?.draftRevisionId)
      throw new DomainError(
        "ALBUM_NOT_FOUND",
        "This album is unavailable.",
        404,
      );
    const revision = async (revisionId: string) => {
      const [row] = await executor
        .select({ data: mediaAlbumRevision.data })
        .from(mediaAlbumRevision)
        .where(
          and(
            eq(mediaAlbumRevision.organizationId, organizationId),
            eq(mediaAlbumRevision.albumId, id),
            eq(mediaAlbumRevision.id, revisionId),
          ),
        )
        .limit(1);
      if (!row)
        throw new DomainError(
          "ALBUM_REVISION_NOT_FOUND",
          "This album revision is unavailable.",
          404,
        );
      return albumDataSchema.parse(row.data);
    };
    const usage = await executor
      .select({ published: mediaAlbumUsage.published, count: count() })
      .from(mediaAlbumUsage)
      .where(
        and(
          eq(mediaAlbumUsage.organizationId, organizationId),
          eq(mediaAlbumUsage.albumId, id),
        ),
      )
      .groupBy(mediaAlbumUsage.published);
    return {
      id,
      version: album.version,
      draftRevisionId: album.draftRevisionId,
      publishedRevisionId: album.publishedRevisionId,
      draft: await revision(album.draftRevisionId),
      published: album.publishedRevisionId
        ? await revision(album.publishedRevisionId)
        : null,
      updatedAt: album.updatedAt.toISOString(),
      savedReferences: usage.find((row) => !row.published)?.count ?? 0,
      publishedReferences: usage.find((row) => row.published)?.count ?? 0,
    };
  }
}
