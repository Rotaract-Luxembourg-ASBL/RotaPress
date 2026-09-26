import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { user } from "../../db/schema/auth";
import { auditEntry, membership } from "../../db/schema/club";
import { mediaUsage } from "../../db/schema/media";
import { project } from "../../db/schema/projects";
import {
  AuthorizationService,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { FeatureService } from "../../src/core/features/FeatureService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { MediaService } from "../../src/features/media/MediaService";
import { ProjectReader } from "../../src/features/projects/ProjectReader";
import { ProjectService } from "../../src/features/projects/ProjectService";
import {
  projectContentSchema,
  type ProjectDto,
} from "../../src/features/projects/project_schemas";
import type { Database } from "../../src/infrastructure/database/client";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";

let runtimePool: Pool;
let migrationPool: Pool;
let db: Database;
let authorization: AuthorizationService;
let projects: ProjectService;
let reader: ProjectReader;
let media: MediaService;
const storageBase = path.resolve(".local/test-uploads");
const storageRoot = path.join(storageBase, `projects-${randomUUID()}`);
const content = {
  title: "Community garden",
  summary: "Volunteers grew a shared garden.",
};
const action = (row: ProjectDto) => ({
  expectedVersion: row.version,
  confirmed: true,
});

function testDatabase(value: string | undefined) {
  if (!value) throw new Error("Run local setup before Projects checks.");
  const target = new URL(value);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  )
    throw new Error(
      "Projects checks require the dedicated local rotapress_test database.",
    );
  return value;
}

async function actor(label: string): Promise<TrustedActor> {
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

async function club() {
  const owner = await actor("project-owner");
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
    name: "Synthetic Projects Club",
    tagline: "",
    description: "",
    locale: "en",
    timezone: "Europe/Luxembourg",
    accentColor: "#25636b",
  });
  return { owner, scope: await authorization.require(owner, "cms.edit") };
}

beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  runtimePool = new Pool({
    connectionString: testDatabase(env.DATABASE_URL),
    max: 5,
  });
  migrationPool = new Pool({
    connectionString: testDatabase(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  db = drizzle(runtimePool, { schema });
  authorization = new AuthorizationService(db);
  media = new MediaService(
    db,
    authorization,
    new LocalStorageDriver(storageRoot),
  );
  projects = new ProjectService(db, authorization, media);
  reader = new ProjectReader(db);
});

beforeEach(async () => {
  await migrationPool.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
});

afterAll(async () => {
  await Promise.all([runtimePool?.end(), migrationPool?.end()]);
  if (
    path.dirname(storageRoot) !== storageBase ||
    !/^projects-[0-9a-f-]{36}$/u.test(path.basename(storageRoot))
  )
    throw new Error(
      "Refusing Projects fixture cleanup outside its disposable upload directory.",
    );
  await rm(storageRoot, { recursive: true, force: true });
});

describe("C03 Projects publication and current authority", () => {
  it("keeps drafts private, generates stable distinct links and publishes only saved content", async () => {
    const { owner } = await club();
    let row = await projects.create(owner, content);
    const second = await projects.create(owner, content);
    expect(row.slug).toMatch(/^community-garden-/u);
    expect(second.slug).not.toBe(row.slug);
    expect(await reader.publicList()).toEqual([]);
    expect(await reader.publicBySlug(row.slug)).toBeNull();
    row = await projects.change(owner, row.id, "publish", action(row));
    expect(row.changed).toBe(false);
    const originalSlug = row.slug;
    row = await projects.change(owner, row.id, "save", {
      expectedVersion: row.version,
      content: {
        ...row.draft,
        title: "Private renamed draft",
        story: "Private working notes",
      },
    });
    expect(row.slug).toBe(originalSlug);
    const published = await reader.publicBySlug(row.slug);
    expect(published).toMatchObject({ title: content.title, story: "" });
    expect(Object.keys(published!)).not.toContain("draft");
    expect(JSON.stringify(published)).not.toContain("Private");
    expect(row.changed).toBe(true);
    row = await projects.change(owner, row.id, "publish", action(row));
    expect((await reader.publicBySlug(row.slug))?.title).toBe(
      "Private renamed draft",
    );
    expect(await projects.detail(owner, row.id)).toEqual(row);
  });

  it("rejects stale concurrent changes and records only committed mutations", async () => {
    const { owner } = await club();
    const row = await projects.create(owner, content);
    const results = await Promise.allSettled(
      ["First edit", "Second edit"].map((title) =>
        projects.change(owner, row.id, "save", {
          expectedVersion: row.version,
          content: { ...row.draft, title },
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "PROJECT_CONFLICT" } });
    await expect(
      projects.change(owner, row.id, "publish", action(row)),
    ).rejects.toMatchObject({ code: "PROJECT_CONFLICT" });
    const entries = await db
      .select()
      .from(auditEntry)
      .where(eq(auditEntry.targetId, row.id));
    expect(entries.map((entry) => entry.action).sort()).toEqual([
      "project.created",
      "project.save",
    ]);
    expect((await projects.detail(owner, row.id)).version).toBe(2);
  });

  it("blocks nonstaff and suspended staff on every private operation", async () => {
    const { owner, scope } = await club();
    const row = await projects.create(owner, content);
    const member = await actor("project-member");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: member.userId,
      role: "member",
      status: "approved",
    });
    await expect(projects.list(member)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(projects.detail(member, row.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(projects.create(member, content)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    for (const operation of [
      "publish",
      "unpublish",
      "archive",
      "restore",
    ] as const)
      await expect(
        projects.change(member, row.id, operation, action(row)),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      projects.change(member, row.id, "save", {
        expectedVersion: row.version,
        content,
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await db
      .update(membership)
      .set({ role: "editor", status: "suspended" })
      .where(eq(membership.userId, member.userId));
    await expect(projects.detail(member, row.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(projects.detail(owner, randomUUID())).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
    });
  });

  it("archives reversibly, restores into a private draft and requires deliberate publication", async () => {
    const { owner } = await club();
    let row = await projects.create(owner, content);
    row = await projects.change(owner, row.id, "publish", action(row));
    row = await projects.change(owner, row.id, "archive", action(row));
    expect(row.archived).toBe(true);
    expect(row.published).toBeNull();
    expect(await reader.publicList()).toEqual([]);
    await expect(
      projects.change(owner, row.id, "publish", action(row)),
    ).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
    row = await projects.change(owner, row.id, "restore", action(row));
    expect(row.archived).toBe(false);
    expect(row.draft.title).toBe(content.title);
    expect(await reader.publicBySlug(row.slug)).toBeNull();
    row = await projects.change(owner, row.id, "publish", action(row));
    row = await projects.change(owner, row.id, "unpublish", action(row));
    expect(await reader.publicBySlug(row.slug)).toBeNull();
    expect(row.draft.title).toBe(content.title);
    await expect(
      projects.change(owner, row.id, "publish", {
        expectedVersion: row.version,
      }),
    ).rejects.toThrow();
  });

  it("enforces disabled availability for admin and public reads while retaining saved records", async () => {
    const { owner } = await club();
    let row = await projects.create(owner, content);
    row = await projects.change(owner, row.id, "publish", action(row));
    const features = new FeatureService(db, authorization);
    await features.configure(owner, {
      key: "projects",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    expect(await reader.publicList()).toEqual([]);
    expect(await reader.publicBySlug(row.slug)).toBeNull();
    await expect(projects.list(owner)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(projects.detail(owner, row.id)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(projects.create(owner, content)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(
      projects.change(owner, row.id, "unpublish", action(row)),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await features.configure(owner, {
      key: "projects",
      enabled: true,
      expectedVersion: 1,
      confirmed: true,
    });
    expect((await reader.publicBySlug(row.slug))?.title).toBe(content.title);
    expect((await projects.detail(owner, row.id)).version).toBe(row.version);
  });

  it("validates boundaries and fails closed for malformed published imports", async () => {
    const { owner } = await club();
    for (const invalid of [
      { title: "" },
      { title: "x".repeat(161) },
      { endDate: "2026-02-30" },
      { startDate: "2026-10-20", endDate: "2026-10-19" },
      { linkUrl: "javascript:alert(1)", linkLabel: "Join" },
      { linkUrl: "https://user:secret@example.test", linkLabel: "Join" },
      { organizationId: randomUUID() },
    ])
      expect(
        projectContentSchema.safeParse({ ...content, ...invalid }).success,
      ).toBe(false);
    const empty = await projects.create(owner, { title: "Unfinished project" });
    await expect(
      projects.change(owner, empty.id, "publish", action(empty)),
    ).rejects.toMatchObject({ code: "PROJECT_SUMMARY_REQUIRED" });
    let row = await projects.create(owner, content);
    row = await projects.change(owner, row.id, "publish", action(row));
    await migrationPool.query(
      "UPDATE club.project SET published = $1 WHERE id = $2",
      [JSON.stringify({ title: "bad", privateField: "secret" }), row.id],
    );
    expect(await reader.publicList()).toEqual([]);
    expect(await reader.publicBySlug(row.slug)).toBeNull();
    await expect(
      db
        .update(project)
        .set({ archived: true, published: content })
        .where(eq(project.id, row.id)),
    ).rejects.toThrow();
  });
});

describe("C04 Projects cover images", () => {
  it("validates owned media, keeps private covers private and retains draft and published references", async () => {
    const { owner } = await club();
    await expect(
      projects.create(owner, { ...content, coverImageId: randomUUID() }),
    ).rejects.toMatchObject({ code: "MEDIA_SCOPE_INVALID" });
    const bytes = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#25636b" },
    })
      .png()
      .toBuffer();
    const image = await media.upload(owner, {
      filename: "synthetic-project.png",
      bytes,
      title: "Synthetic garden",
    });
    let row = await projects.create(owner, {
      ...content,
      coverImageId: image.id,
    });
    await expect(
      projects.change(owner, row.id, "publish", action(row)),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    expect((await projects.detail(owner, row.id)).version).toBe(row.version);
    expect(await reader.publicList()).toEqual([]);
    await expect(media.delete(owner, image.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    const imageValues = {
      id: image.id,
      title: image.title,
      alt: "Volunteers tending a raised garden bed.",
      caption: image.caption,
      tags: image.tags,
      collection: image.collection,
    };
    await media.update(owner, { ...imageValues, visibility: "public" });
    row = await projects.change(owner, row.id, "publish", action(row));
    const publicProject = await reader.publicBySlug(row.slug);
    expect(publicProject?.coverAlt).toBe(imageValues.alt);
    expect(Object.keys(publicProject!).sort()).toEqual(
      [...Object.keys(row.published!), "id", "slug", "coverAlt"].sort(),
    );
    expect(JSON.stringify(publicProject)).not.toContain(image.originalName);
    expect(JSON.stringify(publicProject)).not.toContain(imageValues.title);
    row = await projects.change(owner, row.id, "save", {
      expectedVersion: row.version,
      content: { ...row.draft, coverImageId: null },
    });
    await expect(
      media.update(owner, { ...imageValues, visibility: "private" }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    expect((await reader.publicBySlug(row.slug))?.coverImageId).toBe(image.id);
    row = await projects.change(owner, row.id, "unpublish", action(row));
    await media.update(owner, { ...imageValues, visibility: "private" });
    const retained = await db
      .select()
      .from(mediaUsage)
      .where(eq(mediaUsage.assetId, image.id));
    expect(retained).toEqual([]);
    await media.delete(owner, image.id);
    expect(row.draft.coverImageId).toBeNull();
  });
});
