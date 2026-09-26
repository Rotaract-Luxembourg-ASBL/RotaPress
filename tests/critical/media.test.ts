import { createHash, randomBytes, randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { user } from "../../db/schema/auth";
import { membership } from "../../db/schema/club";
import { automationMediaUpload, mediaAsset } from "../../db/schema/media";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { MediaService } from "../../src/features/media/MediaService";
import { mediaMetadataRevision } from "../../src/features/media/media_automation";
import type { Database } from "../../src/infrastructure/database/client";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";

let runtimePool: Pool;
let migrationPool: Pool;
let db: Database;
let authorization: AuthorizationService;
let media: MediaService;
let driver: LocalStorageDriver;
let imageBytes: Buffer;
const storageBase = path.resolve(".local/test-uploads");
const storageRoot = path.join(storageBase, `critical-${randomUUID()}`);

function requireTestDatabase(connection: string | undefined): string {
  if (!connection) throw new Error("Run setup before critical checks.");
  const target = new URL(connection);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  ) {
    throw new Error(
      "Media checks require the disposable local rotapress_test database.",
    );
  }
  return connection;
}

async function actor(label: string): Promise<TrustedActor> {
  // Service-only trusted-context fixture; browser OTP/session behavior is B01.
  const userId = randomUUID();
  const email = `${label}-${userId}@example.test`;
  await db.insert(user).values({
    id: userId,
    name: `Synthetic ${label}`,
    email,
    emailVerified: true,
  });
  return {
    userId,
    email,
    emailVerified: true,
    sessionId: randomUUID(),
    authenticatedAt: new Date(),
    authMethod: "email-otp",
  };
}

async function installedClub() {
  const owner = await actor("media-owner");
  const claim = randomBytes(32).toString("hex");
  await migrationPool.query(
    "INSERT INTO club.installation (id, nominated_email, claim_hash, claim_expires_at) VALUES (1, $1, $2, $3)",
    [
      owner.email,
      createHash("sha256").update(claim).digest("hex"),
      new Date(Date.now() + 60_000),
    ],
  );
  await new InstallationService(db).complete(owner, {
    claim,
    name: "Synthetic Media Club",
    tagline: "",
    description: "",
    locale: "en",
    timezone: "Europe/Luxembourg",
    accentColor: "#25636b",
  });
  const scope = await authorization.require(owner, "media.manage");
  return { owner, scope };
}

beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  runtimePool = new Pool({
    connectionString: requireTestDatabase(env.DATABASE_URL),
    max: 5,
  });
  migrationPool = new Pool({
    connectionString: requireTestDatabase(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  db = drizzle(runtimePool, { schema });
  authorization = new AuthorizationService(db);
  driver = new LocalStorageDriver(storageRoot);
  media = new MediaService(db, authorization, driver);
  imageBytes = await sharp({
    create: { width: 8, height: 6, channels: 3, background: "#25636b" },
  })
    .png()
    .toBuffer();
});

beforeEach(async () => {
  await migrationPool.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
});

afterAll(async () => {
  await Promise.all([runtimePool?.end(), migrationPool?.end()]);
  // Only this run's explicit disposable upload subtree is removed.
  if (
    path.dirname(storageRoot) !== storageBase ||
    !/^critical-[0-9a-f-]{36}$/.test(path.basename(storageRoot))
  ) {
    throw new Error("Refusing cleanup outside the disposable media test root.");
  }
  await rm(storageRoot, { recursive: true, force: true });
});

describe("C04 media authorization, safe decoding and private local storage", () => {
  it("serializes actor-bound automation upload retries, cleans duplicates and retains deletion tombstones", async () => {
    const { owner, scope } = await installedClub();
    await mkdir(storageRoot, { recursive: true });
    const before = (await readdir(storageRoot)).length;
    const input = {
      requestId: randomUUID(),
      filename: "retry.png",
      bytes: imageBytes,
      alt: "Original alt",
    };
    const uploaded = await Promise.all(
      Array.from({ length: 4 }, () => media.upload(owner, input)),
    );
    expect(new Set(uploaded.map((asset) => asset.id)).size).toBe(1);
    expect(await db.select().from(mediaAsset)).toHaveLength(1);
    expect(await db.select().from(automationMediaUpload)).toHaveLength(1);
    expect((await readdir(storageRoot)).length - before).toBe(1);
    await expect(
      media.upload(owner, { ...input, alt: "Changed retry" }),
    ).rejects.toMatchObject({ code: "MEDIA_UPLOAD_RETRY_CHANGED" });
    const other = await actor("other-editor");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: other.userId,
      status: "approved",
      role: "editor",
    });
    await expect(media.upload(other, input)).rejects.toMatchObject({
      code: "MEDIA_UPLOAD_RETRY_CHANGED",
    });
    const saved = await media.savePrivateMetadata(owner, {
      id: uploaded[0].id,
      expectedRevision: mediaMetadataRevision(uploaded[0]),
      alt: "Human review",
    });
    expect((await media.upload(owner, input)).alt).toBe(saved.alt);
    await media.delete(owner, uploaded[0].id);
    await expect(media.upload(owner, input)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
    expect(await db.select().from(mediaAsset)).toHaveLength(0);
    expect(await db.select().from(automationMediaUpload)).toHaveLength(1);
    expect((await readdir(storageRoot)).length).toBe(before);
  });

  it("allows only current private metadata edits and rejects stale concurrent saves", async () => {
    const { owner } = await installedClub();
    const asset = await media.upload(owner, {
      filename: "metadata.png",
      bytes: imageBytes,
    });
    const input = {
      id: asset.id,
      expectedRevision: mediaMetadataRevision(asset),
      alt: "Updated alt",
    };
    const outcomes = await Promise.allSettled([
      media.savePrivateMetadata(owner, input),
      media.savePrivateMetadata(owner, { ...input, alt: "Another alt" }),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "MEDIA_METADATA_CHANGED" } });
    const latest = await media.detail(owner, asset.id);
    await expect(
      media.savePrivateMetadata(owner, { ...input, visibility: "public" }),
    ).rejects.toThrow();
    const published = await media.update(owner, {
      id: latest.id,
      alt: latest.alt,
      visibility: "public",
    });
    await expect(
      media.savePrivateMetadata(owner, {
        ...input,
        expectedRevision: mediaMetadataRevision(published),
      }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLIC_EDIT_MANUAL" });
    expect((await media.detail(owner, asset.id)).visibility).toBe("public");
    await expect(
      media.savePrivateMetadata(owner, { ...input, id: randomUUID() }),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_FOUND" });
  });

  it("cleans an upload when the bound connection is revoked after image decoding", async () => {
    const { owner } = await installedClub();
    await mkdir(storageRoot, { recursive: true });
    const before = (await readdir(storageRoot)).length;
    await expect(
      media.upload(
        owner,
        { requestId: randomUUID(), filename: "revoked.png", bytes: imageBytes },
        async () => {
          throw new DomainError(
            "AUTOMATION_AUTH_REQUIRED",
            "Connection revoked.",
            401,
          );
        },
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_AUTH_REQUIRED" });
    expect(await db.select().from(mediaAsset)).toHaveLength(0);
    expect(await db.select().from(automationMediaUpload)).toHaveLength(0);
    expect((await readdir(storageRoot)).length).toBe(before);
  });

  it("keeps uploads private and scoped, strips metadata and reloads suspended access", async () => {
    const { owner, scope } = await installedClub();
    const outsider = await actor("ordinary-member");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: outsider.userId,
      status: "approved",
      role: "member",
    });
    await expect(
      media.upload(outsider, { filename: "sample.png", bytes: imageBytes }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const taggedImage = await sharp(imageBytes)
      .withExif({ IFD0: { Artist: "Synthetic fixture" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(taggedImage).metadata()).exif).toBeDefined();
    const asset = await media.upload(owner, {
      filename: "sample.jpg",
      bytes: taggedImage,
      title: "Synthetic image",
      tags: ["fixture"],
    });
    expect(asset).toMatchObject({
      visibility: "private",
      mimeType: "image/webp",
      width: 8,
      height: 6,
    });
    expect(asset).not.toHaveProperty("storageKey");
    expect(asset).not.toHaveProperty("organizationId");
    expect(asset).not.toHaveProperty("uploaderId");
    await expect(media.read(null, asset.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
    await expect(media.read(outsider, asset.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    const bytes = (await media.read(owner, asset.id)).bytes;
    const metadata = await sharp(bytes).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 8, height: 6 });
    expect(metadata.exif).toBeUndefined();
    const replay = new MediaService(
      db,
      authorization,
      new LocalStorageDriver(storageRoot),
    );
    expect((await replay.read(owner, asset.id)).bytes.equals(bytes)).toBe(true);
    await db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.id, scope.membershipId));
    await expect(media.read(owner, asset.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(media.list(owner)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  });

  it("rejects executable, invalid, oversized and path-bearing uploads without persisting records", async () => {
    const { owner } = await installedClub();
    for (const bytes of [
      Buffer.from("<svg onload='alert(1)'/>"),
      Buffer.from("<html>payload</html>"),
      Buffer.from("GIF89a"),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ]) {
      await expect(
        media.upload(owner, { filename: "image.png", bytes }),
      ).rejects.toMatchObject({ status: 422 });
    }
    await expect(
      media.upload(owner, {
        filename: "image.png",
        bytes: Buffer.alloc(5 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_SIZE_INVALID" });
    await expect(
      media.upload(owner, { filename: "../../private.png", bytes: imageBytes }),
    ).rejects.toThrow();
    await expect(
      media.upload(owner, {
        filename: "valid.png",
        bytes: imageBytes,
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow();
    const excessivePixels = await sharp({
      create: { width: 5000, height: 4001, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(
      media.upload(owner, { filename: "large.png", bytes: excessivePixels }),
    ).rejects.toMatchObject({ code: "UPLOAD_IMAGE_INVALID" });
    expect(await db.select().from(mediaAsset)).toHaveLength(0);
  });

  it("requires deliberate public visibility and protects both active publication and revision references", async () => {
    const { owner, scope } = await installedClub();
    const asset = await media.upload(owner, {
      filename: "sample.png",
      bytes: imageBytes,
    });
    const metadata = {
      id: asset.id,
      title: "",
      alt: "Synthetic fixture",
      caption: "",
      tags: [],
      collection: "",
    };
    await expect(
      db.transaction(async (tx) => {
        await authorization.lock(owner, "cms.publish", tx);
        await media.assertPublicAssets(scope.organizationId, [asset.id], tx);
      }),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    await expect(
      db.transaction((tx) =>
        media.assertOwnedAssets(randomUUID(), [asset.id], tx),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_SCOPE_INVALID" });
    await media.update(owner, { ...metadata, visibility: "public" });
    expect((await media.read(null, asset.id)).visibility).toBe("public");
    await db.transaction(async (tx) => {
      await authorization.lock(owner, "cms.publish", tx);
      await media.replaceUsage(
        "cms-revision:fixture",
        scope.organizationId,
        [asset.id],
        tx,
      );
      await media.replaceUsage(
        "cms:fixture",
        scope.organizationId,
        [asset.id],
        tx,
        true,
      );
    });
    await expect(
      media.update(owner, { ...metadata, visibility: "private" }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    const details = await media.usage(owner, asset.id);
    expect(details).toMatchObject({
      asset: { id: asset.id, title: asset.title },
      savedReferences: 1,
      publishedReferences: 1,
    });
    expect(details.asset).not.toHaveProperty("storageKey");
    await expect(media.delete(owner, asset.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    await db.transaction(async (tx) => {
      await authorization.lock(owner, "cms.publish", tx);
      await media.replaceUsage(
        "cms:fixture",
        scope.organizationId,
        [],
        tx,
        true,
      );
    });
    await media.update(owner, { ...metadata, visibility: "private" });
    await expect(media.read(null, asset.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
    await expect(media.delete(owner, asset.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    const unused = await media.upload(owner, {
      filename: "unused.png",
      bytes: imageBytes,
    });
    await media.delete(owner, unused.id);
    await expect(media.read(owner, unused.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
  });

  it("rejects traversal, hardlinked objects and a symlinked upload directory", async () => {
    expect(
      () => new LocalStorageDriver(path.resolve("public/uploads")),
    ).toThrow();
    await expect(driver.read("../test.env")).rejects.toThrow(
      "Invalid media storage key",
    );
    await expect(driver.delete("..\\test.env")).rejects.toThrow(
      "Invalid media storage key",
    );
    const key = await driver.write(Buffer.from("synthetic bytes"));
    const linkedKey = `${randomUUID()}.webp`;
    await link(path.join(storageRoot, key), path.join(storageRoot, linkedKey));
    await expect(driver.read(linkedKey)).rejects.toThrow("Unsafe media file");
    const target = path.join(storageRoot, "target");
    const directoryLink = path.join(storageRoot, "linked");
    await mkdir(target);
    await symlink(target, directoryLink, "junction");
    const unsafe = new LocalStorageDriver(directoryLink);
    await expect(unsafe.write(Buffer.from("synthetic bytes"))).rejects.toThrow(
      "Unsafe media directory",
    );
  });
});
