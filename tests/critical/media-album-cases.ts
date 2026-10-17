import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { mediaAlbumRevision } from "../../db/schema/media-albums";
import { cmsContent, cmsRevision, cmsVariant } from "../../db/schema/cms";
import type {
  AuthorizationService,
  StaffAccess,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { AlbumReader } from "../../src/features/media/AlbumReader";
import { AlbumService } from "../../src/features/media/AlbumService";
import type { MediaService } from "../../src/features/media/MediaService";
import type { Database } from "../../src/infrastructure/database/client";

type Fixture = {
  db: Database;
  media: MediaService;
  authorization: AuthorizationService;
  imageBytes: Buffer;
  installedClub: () => Promise<{ owner: TrustedActor; scope: StaffAccess }>;
};

export function mediaAlbumChecks(fixture: () => Fixture) {
  describe("C04 reusable photo albums", () => {
    it("links only the current editor's recovery checkpoint and omits internal owner keys", async () => {
      const { db, media, imageBytes, installedClub } = fixture();
      const { owner, scope } = await installedClub();
      const asset = await media.upload(owner, {
        filename: "checkpoint.png",
        bytes: imageBytes,
      });
      const [content] = await db
        .insert(cmsContent)
        .values({ organizationId: scope.organizationId, kind: "page" })
        .returning();
      const [variant] = await db
        .insert(cmsVariant)
        .values({
          organizationId: scope.organizationId,
          contentId: content.id,
          locale: "en",
        })
        .returning();
      const [revision] = await db
        .insert(cmsRevision)
        .values({
          variantId: variant.id,
          title: "Recovery page",
          slug: "recovery-page",
          data: {},
          createdBy: owner.userId,
        })
        .returning();
      await db
        .update(cmsVariant)
        .set({ draftRevisionId: revision.id })
        .where(eq(cmsVariant.id, variant.id));
      await db.transaction((tx) =>
        media.replaceUsage(
          `cms-checkpoint:${randomUUID()}:${variant.id}`,
          scope.organizationId,
          [asset.id],
          tx,
        ),
      );
      const hidden = await media.usage(owner, asset.id);
      expect(hidden.destinations).toEqual([]);
      expect(JSON.stringify(hidden)).not.toContain("cms-checkpoint:");
      await db.transaction((tx) =>
        media.replaceUsage(
          `cms-checkpoint:${owner.userId}:${variant.id}`,
          scope.organizationId,
          [asset.id],
          tx,
        ),
      );
      expect((await media.usage(owner, asset.id)).destinations).toContainEqual(
        expect.objectContaining({
          href: `/admin/website/${content.id}?locale=en`,
          title: "Recovery page",
          retained: true,
        }),
      );
    });
    it("keeps draft changes private until album publication updates linked projections and protects the current photos", async () => {
      const { db, media, authorization, imageBytes, installedClub } = fixture();
      const { owner, scope } = await installedClub();
      const albums = new AlbumService(db, authorization, media);
      const reader = new AlbumReader(db);
      const first = await media.uploadFromAdministration(owner, {
        filename: "first.png",
        bytes: imageBytes,
      });
      const second = await media.uploadFromAdministration(owner, {
        filename: "second.png",
        bytes: imageBytes,
      });
      const created = await albums.create(owner, {
        title: "Club memories",
        items: [
          {
            assetId: first.id,
            alt: "First photograph",
            caption: "Original caption",
          },
        ],
      });
      expect(
        await reader.published(scope.organizationId, created.id),
      ).toBeNull();
      await expect(
        reader.assertReferences(scope.organizationId, [created.id], true),
      ).rejects.toMatchObject({ code: "ALBUM_NOT_PUBLISHED" });
      const published = await albums.publish(owner, created.id, {
        expectedVersion: created.version,
      });
      expect((await media.usage(owner, first.id)).destinations).toContainEqual(
        expect.objectContaining({
          href: `/admin/media/albums?album=${created.id}`,
          title: "Club memories",
          kind: "album",
          published: true,
        }),
      );
      const copy = structuredClone(published.published);
      await db.transaction((tx) =>
        reader.replaceUsage(
          "cms:test:published",
          scope.organizationId,
          [created.id],
          tx,
          true,
        ),
      );
      await expect(
        media.update(owner, { id: first.id, visibility: "private" }),
      ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
      const saved = await albums.save(owner, created.id, {
        expectedVersion: published.version,
        data: {
          ...created.draft,
          items: [
            {
              assetId: second.id,
              alt: "Second photograph",
              caption: "New caption",
            },
          ],
        },
      });
      expect(
        (await reader.published(scope.organizationId, created.id))?.items[0]
          .assetId,
      ).toBe(first.id);
      await expect(
        albums.publish(owner, created.id, {
          expectedVersion: published.version,
        }),
      ).rejects.toMatchObject({ code: "ALBUM_CHANGED" });
      const republished = await albums.publish(owner, created.id, {
        expectedVersion: saved.version,
      });
      expect(
        (await reader.published(scope.organizationId, created.id))?.items[0]
          .assetId,
      ).toBe(second.id);
      expect(copy?.items[0].assetId).toBe(first.id);
      await media.update(owner, { id: first.id, visibility: "private" });
      await expect(media.delete(owner, first.id)).rejects.toMatchObject({
        code: "MEDIA_REFERENCED",
      });
      await expect(
        albums.unpublish(owner, created.id, {
          expectedVersion: republished.version,
        }),
      ).rejects.toMatchObject({ code: "ALBUM_PUBLISHED_USE" });
      await db.transaction((tx) =>
        reader.replaceUsage("cms:test:published", scope.organizationId, [], tx),
      );
      const unpublished = await albums.unpublish(owner, created.id, {
        expectedVersion: republished.version,
      });
      expect(
        await reader.published(scope.organizationId, created.id),
      ).toBeNull();
      await db.transaction((tx) =>
        reader.replaceUsage(
          "cms:test:retained",
          scope.organizationId,
          [created.id],
          tx,
        ),
      );
      await expect(
        albums.delete(owner, created.id, {
          expectedVersion: unpublished.version,
        }),
      ).rejects.toMatchObject({ code: "ALBUM_IN_USE" });
      await db.transaction((tx) =>
        reader.replaceUsage("cms:test:retained", scope.organizationId, [], tx),
      );
      await albums.delete(owner, created.id, {
        expectedVersion: unpublished.version,
      });
      await media.delete(owner, first.id);
      expect(await db.select().from(mediaAlbumRevision)).toHaveLength(0);
    });

    it("rejects private publication, stale writes, foreign photographs and suspended members", async () => {
      const { db, media, authorization, imageBytes, installedClub } = fixture();
      const { owner, scope } = await installedClub();
      const albums = new AlbumService(db, authorization, media);
      const asset = await media.upload(owner, {
        filename: "private.png",
        bytes: imageBytes,
      });
      const created = await albums.create(owner, {
        title: "Private album",
        items: [{ assetId: asset.id, alt: "Private photograph" }],
      });
      await expect(
        albums.publish(owner, created.id, { expectedVersion: created.version }),
      ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
      await expect(
        albums.save(owner, created.id, {
          expectedVersion: created.version,
          data: {
            ...created.draft,
            items: [{ assetId: randomUUID(), alt: "Foreign image" }],
          },
        }),
      ).rejects.toMatchObject({ code: "MEDIA_KIND_INVALID" });
      const saved = await albums.save(owner, created.id, {
        expectedVersion: created.version,
        data: { ...created.draft, title: "Updated album" },
      });
      await expect(
        albums.save(owner, created.id, {
          expectedVersion: created.version,
          data: created.draft,
        }),
      ).rejects.toMatchObject({ code: "ALBUM_CHANGED" });
      await expect(
        db
          .update(mediaAlbumRevision)
          .set({ data: {} })
          .where(eq(mediaAlbumRevision.id, saved.draftRevisionId)),
      ).rejects.toThrow();
      await expect(
        db
          .delete(mediaAlbumRevision)
          .where(eq(mediaAlbumRevision.id, saved.draftRevisionId)),
      ).rejects.toThrow();
      expect((await albums.get(owner, created.id)).draft.title).toBe(
        "Updated album",
      );
      await db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.id, scope.membershipId));
      await expect(albums.list(owner, {})).rejects.toThrow();
      await expect(
        albums.save(owner, created.id, {
          expectedVersion: saved.version,
          data: created.draft,
        }),
      ).rejects.toThrow();
    });
  });
}
