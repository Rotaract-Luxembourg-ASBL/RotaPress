import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditEntry, membership } from "../../db/schema/club";
import { mediaAsset } from "../../db/schema/media";
import type { AuthorizationService, StaffAccess, TrustedActor } from "../../src/core/authorization/AuthorizationService";
import type { MediaService } from "../../src/features/media/MediaService";
import { mediaMetadataRevision } from "../../src/features/media/media_automation";
import type { MediaAssetDto } from "../../src/features/media/media_schemas";
import type { Database } from "../../src/infrastructure/database/client";

type Fixture = {
  db: Database; media: MediaService; authorization: AuthorizationService; imageBytes: Buffer;
  installedClub: () => Promise<{ owner: TrustedActor; scope: StaffAccess }>;
};
const target = (asset: MediaAssetDto) => ({ id: asset.id, expectedRevision: mediaMetadataRevision(asset) });

export function mediaAdministrationChecks(fixture: () => Fixture) {
  describe("C04 gallery management", () => {
    it("makes staff uploads public by default, retains explicit private uploads and the delegated private default", async () => {
      const { media, imageBytes, installedClub } = fixture();
      const { owner } = await installedClub();
      const upload = { filename: "staff-public.png", bytes: imageBytes, requestId: randomUUID() };
      const publicAsset = await media.uploadFromAdministration(owner, upload);
      expect(publicAsset.visibility).toBe("public");
      expect((await media.read(null, publicAsset.id)).visibility).toBe("public");
      expect((await media.uploadFromAdministration(owner, upload)).id).toBe(publicAsset.id);
      await expect(media.uploadFromAdministration(owner, { ...upload, visibility: "private" })).rejects.toMatchObject({ code: "MEDIA_UPLOAD_RETRY_CHANGED" });
      const privateAsset = await media.uploadFromAdministration(owner, {
        filename: "staff-private.png", bytes: imageBytes, visibility: "private",
      });
      expect(privateAsset.visibility).toBe("private");
      await expect(media.read(null, privateAsset.id)).rejects.toMatchObject({ code: "MEDIA_NOT_FOUND" });
      expect((await media.upload(owner, { filename: "delegated.png", bytes: imageBytes })).visibility).toBe("private");
      await expect(media.upload(owner, { filename: "ungranted.png", bytes: imageBytes, visibility: "public" })).rejects.toThrow();
    });

    it("checks an edited copy's original again under the upload transaction lock", async () => {
      const { db, media, imageBytes, installedClub } = fixture();
      const { owner } = await installedClub();
      const source = await media.uploadFromAdministration(owner, { filename: "original.png", bytes: imageBytes });
      await expect(media.uploadFromAdministration(owner, { filename: "edited-copy.png", bytes: imageBytes },
        async () => { await media.update(owner, { id: source.id, visibility: "private" }); }, target(source),
      )).rejects.toMatchObject({ code: "MEDIA_METADATA_CHANGED" });
      expect(await db.select().from(mediaAsset)).toHaveLength(1);
      expect((await media.detail(owner, source.id)).visibility).toBe("private");
      await expect(media.read(null, source.id)).rejects.toMatchObject({ code: "MEDIA_NOT_FOUND" });
    });

    it("changes visibility and collection/tags in atomic batches while preserving image bytes and other metadata", async () => {
      const { media, imageBytes, installedClub } = fixture();
      const { owner } = await installedClub();
      const first = await media.upload(owner, {
        filename: "first.png", bytes: imageBytes, title: "First", alt: "First alt", caption: "First caption", collection: "Before", tags: ["original"],
      });
      const second = await media.upload(owner, { filename: "second.png", bytes: imageBytes, title: "Second", alt: "Second alt" });
      const before = (await media.read(owner, first.id)).bytes;
      const published = await media.updateBatch(owner, { assets: [target(first), target(second)], visibility: "public" });
      expect(published.map((asset) => asset.id)).toEqual([first.id, second.id]);
      expect(published[0]).toMatchObject({ ...first, visibility: "public" });
      expect((await media.read(null, first.id)).bytes.equals(before)).toBe(true);
      const edited = await media.updateBatch(owner, { assets: published.map(target), collection: "After", tags: ["new"] });
      expect(edited[0]).toMatchObject({ title: "First", alt: "First alt", caption: "First caption", visibility: "public", collection: "After", tags: ["new"] });
      expect(edited[1]).toMatchObject({ title: "Second", alt: "Second alt", caption: "", collection: "After", tags: ["new"] });
      const hidden = await media.updateBatch(owner, { assets: edited.map(target), visibility: "private" });
      expect(hidden.every((asset) => asset.visibility === "private")).toBe(true);
      await expect(media.read(null, first.id)).rejects.toMatchObject({ code: "MEDIA_NOT_FOUND" });
    });

    it("rejects a stale or missing target, duplicates and oversize batches without changing rows or adding audits", async () => {
      const { db, media, imageBytes, installedClub } = fixture();
      const { owner } = await installedClub();
      const first = await media.upload(owner, { filename: "first.png", bytes: imageBytes });
      const second = await media.upload(owner, { filename: "second.png", bytes: imageBytes });
      const changed = await media.update(owner, { title: "Changed", visibility: "private", id: second.id });
      const auditsBefore = (await db.select().from(auditEntry)).length;
      await expect(media.updateBatch(owner, { assets: [target(first), target(second)], visibility: "public" })).rejects.toMatchObject({ code: "MEDIA_METADATA_CHANGED" });
      await expect(media.updateBatch(owner, { assets: [target(first), { id: randomUUID(), expectedRevision: "0".repeat(64) }], visibility: "public" })).rejects.toMatchObject({ code: "MEDIA_NOT_FOUND" });
      await expect(media.deleteBatch(owner, { assets: [target(first), target(second)] })).rejects.toMatchObject({ code: "MEDIA_METADATA_CHANGED" });
      await expect(media.updateBatch(owner, { assets: [target(first), target(first)], visibility: "public" })).rejects.toThrow();
      await expect(media.updateBatch(owner, { assets: Array.from({ length: 251 }, () => ({ id: randomUUID(), expectedRevision: "0".repeat(64) })), visibility: "public" })).rejects.toThrow();
      await expect(media.update(owner, { id: changed.id, title: "Stale overwrite", visibility: "private", expectedRevision: target(second).expectedRevision })).rejects.toMatchObject({ code: "MEDIA_METADATA_CHANGED" });
      expect(await media.detail(owner, first.id)).toMatchObject(first);
      expect(await media.detail(owner, second.id)).toMatchObject(changed);
      expect((await db.select().from(auditEntry)).length).toBe(auditsBefore);
    });

    it("protects every published/revision reference and deletes unused selections together", async () => {
      const { media, authorization, imageBytes, installedClub } = fixture();
      const { owner, scope } = await installedClub();
      const free = await media.uploadFromAdministration(owner, { filename: "free.png", bytes: imageBytes });
      const retained = await media.uploadFromAdministration(owner, { filename: "retained.png", bytes: imageBytes, title: "Published club photo" });
      await fixture().db.transaction(async (tx) => {
        await authorization.lock(owner, "cms.publish", tx);
        await media.replaceUsage("cms:gallery-fixture", scope.organizationId, [retained.id], tx, true);
        await media.replaceUsage("cms-revision:gallery-fixture", scope.organizationId, [retained.id], tx);
      });
      await expect(media.updateBatch(owner, { assets: [target(free), target(retained)], visibility: "private" })).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE", message: expect.stringContaining("Published club photo") });
      expect((await media.detail(owner, free.id)).visibility).toBe("public");
      await expect(media.deleteBatch(owner, { assets: [target(free), target(retained)] })).rejects.toMatchObject({ code: "MEDIA_REFERENCED" });
      expect((await media.read(null, free.id)).visibility).toBe("public");
      const other = await media.upload(owner, { filename: "other.png", bytes: imageBytes });
      expect(await media.deleteBatch(owner, { assets: [target(free), target(other)] })).toEqual([free.id, other.id]);
      await expect(media.detail(owner, free.id)).rejects.toMatchObject({ code: "MEDIA_NOT_FOUND" });
      await expect(media.detail(owner, other.id)).rejects.toMatchObject({ code: "MEDIA_NOT_FOUND" });
      expect((await media.detail(owner, retained.id)).visibility).toBe("public");
    });

    it("rechecks current membership for bulk and library operations", async () => {
      const { db, media, imageBytes, installedClub } = fixture();
      const { owner, scope } = await installedClub();
      const asset = await media.upload(owner, { filename: "scope.png", bytes: imageBytes });
      await db.update(membership).set({ status: "suspended" }).where(eq(membership.id, scope.membershipId));
      for (const operation of [
        () => media.updateBatch(owner, { assets: [target(asset)], visibility: "public" }),
        () => media.deleteBatch(owner, { assets: [target(asset)] }),
        () => media.adminList(owner, {}),
        () => media.uploadFromAdministration(owner, { filename: "denied.png", bytes: imageBytes }),
      ]) await expect(operation()).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      const [stored] = await db.select().from(mediaAsset).where(eq(mediaAsset.id, asset.id));
      expect(stored.visibility).toBe("private");
    });

    it("paginates beyond 250 and applies literal search, visibility, collection, dates and stable sorting", async () => {
      const { db, media, installedClub } = fixture();
      const { owner, scope } = await installedClub();
      await db.insert(mediaAsset).values(Array.from({ length: 255 }, (_, index) => ({
        organizationId: scope.organizationId, uploaderId: owner.userId, storageKey: `${randomUUID()}.webp`,
        originalName: `fixture-${String(index).padStart(3, "0")}.png`, size: 1, width: 1, height: 1,
        title: index === 0 ? "Literal 100% club_photo" : `Fixture ${String(index).padStart(3, "0")}`,
        tags: index === 0 ? ["search-tag"] : [], collection: index < 3 ? "Projects" : "Events",
        visibility: index % 2 === 0 ? "public" as const : "private" as const,
        createdAt: new Date(`2026-10-${index < 3 ? "01" : "02"}T12:00:00.000Z`),
      })));
      const all = await media.adminList(owner, { page: 6, pageSize: 48 });
      expect(all).toMatchObject({ total: 255, page: 6, pageSize: 48, counts: { all: 255, public: 128, private: 127 }, collections: ["Events", "Projects"] });
      expect(all.assets).toHaveLength(15);
      expect(all.assets[0].metadataRevision).toMatch(/^[a-f0-9]{64}$/);
      expect(all.assets[0]).not.toHaveProperty("storageKey");
      expect((await media.adminList(owner, { search: "100% club_photo" })).total).toBe(1);
      expect((await media.adminList(owner, { search: "search-tag" })).total).toBe(1);
      const filtered = await media.adminList(owner, { visibility: "public", collection: "Projects", dateFrom: "2026-10-01", dateTo: "2026-10-01", sort: "title", page: 99 });
      expect(filtered).toMatchObject({ total: 2, page: 1, counts: { all: 255, public: 128, private: 127 } });
      expect(filtered.assets.map((asset) => asset.title)).toEqual(["Fixture 002", "Literal 100% club_photo"]);
      await expect(media.adminList(owner, { dateFrom: "2026-02-30" })).rejects.toThrow();
      await expect(media.adminList(owner, { dateFrom: "2026-10-03", dateTo: "2026-10-01" })).rejects.toThrow();
      // Automation's existing narrow list and closed schemas stay stable.
      expect(await media.list(owner)).toHaveLength(250);
    });
  });
}
