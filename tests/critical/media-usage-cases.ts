import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cmsContent, cmsRevision, cmsVariant } from "../../db/schema/cms";
import { membership } from "../../db/schema/club";
import { eventManager, eventModule } from "../../db/schema/events";
import { mediaAsset, mediaUsage } from "../../db/schema/media";
import type {
  AuthorizationService,
  StaffAccess,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { EventService } from "../../src/features/events/EventService";
import type { MediaService } from "../../src/features/media/MediaService";
import type { Database } from "../../src/infrastructure/database/client";
import { executeOperation } from "../../src/integrations/automation/catalogue";
import type { AutomationContext } from "../../src/integrations/automation/operation";

type Fixture = {
  db: Database;
  media: MediaService;
  authorization: AuthorizationService;
  imageBytes: Buffer;
  installedClub: () => Promise<{ owner: TrustedActor; scope: StaffAccess }>;
  actor: (label: string) => Promise<TrustedActor>;
};

export function mediaUsageChecks(get: () => Fixture) {
  async function page(
    f: Fixture,
    owner: TrustedActor,
    organizationId: string,
    title: string,
    eventId?: string,
  ) {
    const [content] = await f.db
      .insert(cmsContent)
      .values({
        organizationId,
        kind: "page",
        ...(eventId ? { eventId, moduleKey: "website" as const } : {}),
      })
      .returning();
    const [variant] = await f.db
      .insert(cmsVariant)
      .values({ organizationId, contentId: content.id, locale: "en" })
      .returning();
    const [revision] = await f.db
      .insert(cmsRevision)
      .values({
        variantId: variant.id,
        title,
        slug: `usage-${content.id}`,
        data: {},
        createdBy: owner.userId,
      })
      .returning();
    await f.db
      .update(cmsVariant)
      .set({ draftRevisionId: revision.id })
      .where(eq(cmsVariant.id, variant.id));
    return { content, variant, revision };
  }
  describe("media usage continuation", () => {
    it("reaches every destination beyond 500 references and 50 pages without weakening reference protection", async () => {
      const f = get();
      const { owner, scope } = await f.installedClub();
      const asset = await f.media.uploadFromAdministration(owner, {
        filename: "usage.png",
        bytes: f.imageBytes,
      });
      const pages: Awaited<ReturnType<typeof page>>[] = [];
      for (let index = 0; index < 61; index++)
        pages.push(
          await page(f, owner, scope.organizationId, `Usage page ${index}`),
        );
      const historical = await f.db
        .insert(cmsRevision)
        .values(
          Array.from({ length: 520 }, (_, index) => ({
            variantId: pages[0].variant.id,
            title: `Retained title ${index}`,
            slug: "retained",
            data: {},
            createdBy: owner.userId,
          })),
        )
        .returning({ id: cmsRevision.id });
      await f.db.insert(mediaUsage).values([
        ...pages.map(({ revision }) => ({
          ownerKey: `cms-revision:${revision.id}`,
          organizationId: scope.organizationId,
          assetId: asset.id,
        })),
        ...historical.map(({ id }) => ({
          ownerKey: `cms-revision:${id}`,
          organizationId: scope.organizationId,
          assetId: asset.id,
        })),
        {
          ownerKey: `cms:${pages[0].variant.id}`,
          organizationId: scope.organizationId,
          assetId: asset.id,
          published: true,
        },
      ]);
      const found = new Set<string>();
      for (let index = 1; index <= 4; index++) {
        const result = await f.media.usage(owner, asset.id, {
          page: index,
          pageSize: 20,
        });
        expect(result).toMatchObject({
          page: index,
          pageSize: 20,
          total: 61,
          savedReferences: 581,
          publishedReferences: 1,
        });
        expect(result.destinations).toHaveLength(index === 4 ? 1 : 20);
        for (const destination of result.destinations) {
          expect(found.has(destination.href)).toBe(false);
          expect(destination.title).toMatch(/^Usage page /);
          found.add(destination.href);
        }
      }
      expect(found.size).toBe(61);
      expect(
        (await f.media.usage(owner, asset.id, { page: 100, pageSize: 20 }))
          .page,
      ).toBe(4);
      await expect(
        f.media.update(owner, { id: asset.id, visibility: "private" }),
      ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
      await expect(f.media.delete(owner, asset.id)).rejects.toMatchObject({
        code: "MEDIA_REFERENCED",
      });
    });

    it("counts only currently authorized destinations and requires separate delegated domain and file grants", async () => {
      const f = get();
      const { owner, scope } = await f.installedClub();
      const asset = await f.media.upload(owner, {
        filename: "scope.png",
        bytes: f.imageBytes,
      });
      const ordinary = await page(
        f,
        owner,
        scope.organizationId,
        "Allowed website title",
      );
      const events = new EventService(f.db, f.authorization);
      const event = await events.create(owner, {
        title: "Private usage event",
        description: "",
        startsAt: "2030-01-01T12:00:00Z",
        endsAt: null,
        timezone: "Europe/Luxembourg",
        venue: "",
        visibility: "private",
        managerUserId: owner.userId,
      });
      await f.db.insert(eventModule).values({
        eventId: event.id,
        organizationId: scope.organizationId,
        key: "website",
        state: "enabled",
      });
      const privatePage = await page(
        f,
        owner,
        scope.organizationId,
        "Private event title",
        event.id,
      );
      await f.db.insert(mediaUsage).values(
        [ordinary, privatePage].map(({ revision }) => ({
          organizationId: scope.organizationId,
          assetId: asset.id,
          ownerKey: `cms-revision:${revision.id}`,
        })),
      );
      const editor = await f.actor("usage-editor");
      await f.db.insert(membership).values({
        userId: editor.userId,
        organizationId: scope.organizationId,
        role: "editor",
        status: "approved",
      });
      const native = await f.media.usage(editor, asset.id);
      expect(native.total).toBe(1);
      expect(native.savedReferences).toBe(2);
      expect(JSON.stringify(native)).not.toContain("Private event title");
      const context = {
        services: { media: f.media, authorization: f.authorization },
        principal: {
          actor: owner,
          organizationId: scope.organizationId,
          keyId: "usage-fixture",
          scopes: ["media:read"],
          sourceOrigins: [],
        },
      } as unknown as AutomationContext;
      const limited = await executeOperation(context, "media_usage", {
        id: asset.id,
      });
      expect(limited).toMatchObject({
        total: 0,
        destinations: [],
        savedReferences: 2,
      });
      context.principal.scopes = ["media:read", "website:read"];
      expect(
        await executeOperation(context, "media_usage", { id: asset.id }),
      ).toMatchObject({ total: 1 });
      context.principal.scopes.push("events:read");
      expect(
        await executeOperation(context, "media_usage", { id: asset.id }),
      ).toMatchObject({ total: 2 });
      await f.db
        .insert(eventManager)
        .values({
          eventId: event.id,
          organizationId: scope.organizationId,
          userId: editor.userId,
          role: "editor",
        });
      await f.db
        .update(membership)
        .set({ role: "administrator" })
        .where(eq(membership.userId, editor.userId));
      context.principal.actor = editor;
      expect(
        await executeOperation(context, "media_usage", { id: asset.id }),
      ).toMatchObject({ total: 2 });
      await f.db
        .update(membership)
        .set({ role: "editor" })
        .where(eq(membership.userId, editor.userId));
      // The same editor can still open their native event assignment, but the
      // retained events:read grant no longer has its required current capability.
      expect((await f.media.usage(editor, asset.id)).total).toBe(2);
      const downgraded = await executeOperation(context, "media_usage", {
        id: asset.id,
      });
      expect(downgraded).toMatchObject({ total: 1, savedReferences: 2 });
      expect(JSON.stringify(downgraded)).not.toContain("Private event title");
      context.principal.actor = owner;
      const [file] = await f.db
        .insert(mediaAsset)
        .values({
          organizationId: scope.organizationId,
          uploaderId: owner.userId,
          kind: "document",
          mimeType: "application/pdf",
          originalName: "synthetic.pdf",
          storageKey: `${randomUUID()}.pdf`,
          size: 10,
        })
        .returning({ id: mediaAsset.id });
      await expect(
        executeOperation(context, "media_usage", { id: file.id }),
      ).rejects.toMatchObject({ code: "MEDIA_KIND_REQUIRED" });
      await expect(
        executeOperation(context, "files_usage", { id: file.id }),
      ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
      context.principal.scopes = ["files:read"];
      expect(
        await executeOperation(context, "files_usage", { id: file.id }),
      ).toMatchObject({ total: 0 });
      await expect(
        executeOperation(context, "files_usage", { id: asset.id }),
      ).rejects.toMatchObject({ code: "MEDIA_KIND_REQUIRED" });
    });
  });
}
