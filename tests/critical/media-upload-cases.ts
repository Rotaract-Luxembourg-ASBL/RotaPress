import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { membership } from "../../db/schema/club";
import { mediaAsset } from "../../db/schema/media";
import { mediaUploadSession } from "../../db/schema/media-uploads";
import type {
  AuthorizationService,
  StaffAccess,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import type { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { MediaUploadService } from "../../src/features/media/MediaUploadService";
import type { MediaService } from "../../src/features/media/MediaService";
import { deliverMedia } from "../../src/features/media/media_delivery";
import { UPLOAD_CHUNK_BYTES } from "../../src/features/media/media_schemas";
import { mediaCodecFixtures } from "./media-codec-fixtures";

type Fixture = {
  db: Database;
  authorization: AuthorizationService;
  driver: LocalStorageDriver;
  media: MediaService;
  imageBytes: Buffer;
  actor: (label: string) => Promise<TrustedActor>;
  installedClub: () => Promise<{ owner: TrustedActor; scope: StaffAccess }>;
};
export function mediaUploadChecks(fixture: () => Fixture) {
  const service = () => {
    const f = fixture();
    return new MediaUploadService(f.db, f.authorization, f.driver);
  };
  describe("C04 resumable media uploads and authorized file streaming", () => {
    it("expires bounded sessions and retries failed terminal cleanup without losing chunk receipts", async () => {
      const { db, installedClub, driver, imageBytes } = fixture();
      const { owner, scope } = await installedClub();
      const uploads = service();
      const input = {
        requestId: randomUUID(),
        filename: "cleanup.png",
        kind: "image" as const,
        size: imageBytes.length,
        visibility: "public" as const,
        title: "",
        alt: "",
        caption: "",
        collection: "",
        tags: [],
      };
      const session = await uploads.start(owner, input);
      await uploads.putChunk(owner, session.id, 0, imageBytes);
      const realDelete = driver.delete.bind(driver);
      const failure = vi
        .spyOn(driver, "delete")
        .mockImplementation(async (key) => {
          if (key.endsWith(".part"))
            throw new Error("Synthetic deletion failure");
          return realDelete(key);
        });
      try {
        await uploads.cancel(owner, session.id);
      } finally {
        failure.mockRestore();
      }
      const [cancelled] = await db
        .select()
        .from(mediaUploadSession)
        .where(eq(mediaUploadSession.id, session.id));
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.chunks["0"].key).toBeDefined();
      expect(cancelled.chunks["0"].retryAfter).toBeDefined();
      await db
        .update(mediaUploadSession)
        .set({
          chunks: {
            "0": {
              ...cancelled.chunks["0"],
              retryAfter: new Date(0).toISOString(),
            },
          },
        })
        .where(eq(mediaUploadSession.id, session.id));
      await db.insert(mediaUploadSession).values(
        Array.from({ length: 22 }, () => ({
          organizationId: scope.organizationId,
          actorUserId: owner.userId,
          requestId: randomUUID(),
          inputHash: "a".repeat(64),
          input,
          size: input.size,
          expiresAt: new Date(0),
        })),
      );
      const active = await uploads.start(owner, {
        ...input,
        requestId: randomUUID(),
      });
      expect(await uploads.expire()).toMatchObject({
        expired: 20,
        cleanedFiles: 1,
        cleanupFailures: 0,
      });
      const [cleaned] = await db
        .select()
        .from(mediaUploadSession)
        .where(eq(mediaUploadSession.id, session.id));
      expect(cleaned.chunks).toEqual({
        "0": { hash: cancelled.chunks["0"].hash },
      });
      expect(await uploads.expire()).toMatchObject({
        expired: 2,
        cleanedFiles: 0,
      });
      expect((await uploads.status(owner, active.id)).status).toBe("uploading");
      await expect(uploads.start(owner, input)).rejects.toMatchObject({
        code: "MEDIA_UPLOAD_UNAVAILABLE",
      });
    });

    it("resumes exact chunks, rejects changed retries and finishes public images once", async () => {
      const { db, imageBytes, installedClub, media, actor } = fixture();
      const { owner, scope } = await installedClub();
      const uploads = service();
      const input = {
        requestId: randomUUID(),
        filename: "resumable.png",
        kind: "image",
        size: imageBytes.length,
      };
      const session = await uploads.start(owner, input);
      expect(await uploads.start(owner, input)).toEqual(session);
      const other = await actor("other-uploader");
      await db
        .insert(membership)
        .values({
          organizationId: scope.organizationId,
          userId: other.userId,
          status: "approved",
          role: "editor",
        });
      await expect(uploads.status(other, session.id)).rejects.toMatchObject({
        code: "MEDIA_UPLOAD_UNAVAILABLE",
      });
      await expect(uploads.start(other, input)).rejects.toMatchObject({
        code: "MEDIA_UPLOAD_RETRY_CHANGED",
      });
      await expect(
        uploads.start(owner, { ...input, visibility: "private" }),
      ).rejects.toMatchObject({ code: "MEDIA_UPLOAD_RETRY_CHANGED" });
      await expect(uploads.finish(owner, session.id)).rejects.toMatchObject({
        code: "MEDIA_UPLOAD_INCOMPLETE",
      });
      await uploads.putChunk(owner, session.id, 0, imageBytes);
      expect((await uploads.status(owner, session.id)).received).toEqual([0]);
      await uploads.putChunk(owner, session.id, 0, imageBytes);
      const changed = Buffer.from(imageBytes);
      changed[0] ^= 1;
      await expect(
        uploads.putChunk(owner, session.id, 0, changed),
      ).rejects.toMatchObject({ code: "MEDIA_UPLOAD_CHUNK_CHANGED" });
      const outcomes = await Promise.all([
        uploads.finish(owner, session.id),
        uploads.finish(owner, session.id),
      ]);
      const asset = outcomes[0];
      expect(outcomes[1].id).toBe(asset.id);
      expect(asset).toMatchObject({ kind: "image", visibility: "public" });
      expect((await uploads.finish(owner, session.id)).id).toBe(asset.id);
      expect(await db.select().from(mediaAsset)).toHaveLength(1);
      await media.delete(owner, asset.id);
      await expect(uploads.finish(owner, session.id)).rejects.toMatchObject({
        code: "MEDIA_UPLOAD_UNAVAILABLE",
      });
    });

    it("serves private PDFs and video ranges only after current access checks", async () => {
      const { media, installedClub } = fixture();
      const { owner } = await installedClub();
      const uploads = service();
      const pdf = await PDFDocument.create();
      pdf.addPage([100, 100]);
      for (const [kind, bytes, filename] of [
        ["document", Buffer.from(await pdf.save()), "private.pdf"],
        [
          "video",
          Buffer.from(mediaCodecFixtures["h264.mp4"], "base64"),
          "private.mp4",
        ],
      ] as const) {
        const session = await uploads.start(owner, {
          requestId: randomUUID(),
          kind,
          size: bytes.length,
          filename,
          visibility: "private",
        });
        await uploads.putChunk(owner, session.id, 0, bytes);
        const asset = await uploads.finish(owner, session.id);
        await expect(
          deliverMedia(
            media,
            null,
            asset.id,
            new Request(`http://localhost/media/${asset.id}`),
          ),
        ).rejects.toMatchObject({ code: "MEDIA_NOT_FOUND" });
        const partial = await deliverMedia(
          media,
          owner,
          asset.id,
          new Request(`http://localhost/media/${asset.id}`, {
            headers: { Range: "bytes=10-19" },
          }),
        );
        expect(partial.status).toBe(206);
        expect(partial.headers.get("content-range")).toBe(
          `bytes 10-19/${bytes.length}`,
        );
        expect(Buffer.from(await partial.arrayBuffer())).toEqual(
          bytes.subarray(10, 20),
        );
        const head = await deliverMedia(
          media,
          owner,
          asset.id,
          new Request(`http://localhost/media/${asset.id}`, { method: "HEAD" }),
        );
        expect(head.headers.get("content-length")).toBe(String(bytes.length));
        expect(await head.text()).toBe("");
        expect(
          (
            await deliverMedia(
              media,
              owner,
              asset.id,
              new Request(`http://localhost/media/${asset.id}`, {
                headers: { Range: `bytes=${bytes.length}-` },
              }),
            )
          ).status,
        ).toBe(416);
        await expect(media.inspect(owner, asset.id)).rejects.toMatchObject({
          code: "MEDIA_IMAGE_REQUIRED",
        });
      }
    });

    it("rejects suspended uploaders and expired/cancelled sessions without creating an asset", async () => {
      const { db, installedClub, imageBytes } = fixture();
      const { owner } = await installedClub();
      const uploads = service();
      const input = {
        requestId: randomUUID(),
        filename: "cancelled.png",
        kind: "image",
        size: imageBytes.length,
      };
      const cancelled = await uploads.start(owner, input);
      await uploads.putChunk(owner, cancelled.id, 0, imageBytes);
      await uploads.cancel(owner, cancelled.id);
      expect(await uploads.cancel(owner, cancelled.id)).toEqual({
        cancelled: true,
      });
      await expect(uploads.finish(owner, cancelled.id)).rejects.toMatchObject({
        code: "MEDIA_UPLOAD_UNAVAILABLE",
      });
      await expect(uploads.start(owner, input)).rejects.toMatchObject({
        code: "MEDIA_UPLOAD_UNAVAILABLE",
      });
      const expired = await uploads.start(owner, {
        ...input,
        requestId: randomUUID(),
      });
      await db
        .update(mediaUploadSession)
        .set({ expiresAt: new Date(Date.now() - 1) })
        .where(eq(mediaUploadSession.id, expired.id));
      await expect(
        uploads.putChunk(owner, expired.id, 0, imageBytes),
      ).rejects.toMatchObject({ code: "MEDIA_UPLOAD_UNAVAILABLE" });
      const suspended = await uploads.start(owner, {
        ...input,
        requestId: randomUUID(),
      });
      await uploads.putChunk(owner, suspended.id, 0, imageBytes);
      await db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, owner.userId));
      await expect(uploads.finish(owner, suspended.id)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      expect(await db.select().from(mediaAsset)).toHaveLength(0);
    });

    it("accepts out-of-order chunks but refuses incomplete or malformed files", async () => {
      const { installedClub } = fixture();
      const { owner } = await installedClub();
      const uploads = service();
      const input = {
        requestId: randomUUID(),
        filename: "malformed.mp4",
        kind: "video",
        size: UPLOAD_CHUNK_BYTES + 3,
      };
      const session = await uploads.start(owner, input);
      await uploads.putChunk(owner, session.id, 1, Buffer.from("end"));
      await expect(
        uploads.putChunk(owner, session.id, 0, Buffer.from("short")),
      ).rejects.toMatchObject({ code: "MEDIA_UPLOAD_CHUNK" });
      await expect(uploads.finish(owner, session.id)).rejects.toMatchObject({
        code: "MEDIA_UPLOAD_INCOMPLETE",
      });
      await uploads.putChunk(
        owner,
        session.id,
        0,
        Buffer.alloc(UPLOAD_CHUNK_BYTES, 0x41),
      );
      await expect(uploads.finish(owner, session.id)).rejects.toMatchObject({
        code: "MEDIA_FORMAT_UNSUPPORTED",
      });
      await uploads.cancel(owner, session.id);
    });
  });
}
