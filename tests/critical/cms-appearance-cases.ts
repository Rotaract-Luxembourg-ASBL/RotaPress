import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import sharp from "sharp";
import { membership } from "../../db/schema/club";
import type { Database } from "../../src/infrastructure/database/client";
import {
  AuthorizationService,
  type StaffAccess,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms";
import type { MediaService } from "../../src/features/media";
import { EventService } from "../../src/features/events";
import { defaultSiteSettings } from "../../src/features/cms/cms_schemas";
import {
  copyPageTemplate,
  starterPages,
} from "../../src/features/cms/page_templates";

// Shares C03's guarded database lifecycle and real service fixtures.
export function appearanceChecks(
  context: () => {
    db: Database;
    cms: CmsService;
    media: MediaService;
    migrationPool: Pool;
    actor: (name: string) => Promise<TrustedActor>;
    installedClub: () => Promise<{ owner: TrustedActor; scope: StaffAccess }>;
  },
) {
  describe("C03 theme boundaries and copy-only templates", () => {
    it("activates and restores appearance without changing content, navigation, media or event authority", async () => {
      const { db, cms, media, migrationPool, installedClub, actor } = context();
      const { owner, scope } = await installedClub();
      const member = await actor("theme-member");
      await db
        .insert(membership)
        .values({
          organizationId: scope.organizationId,
          userId: member.userId,
          role: "member",
          status: "approved",
        });
      const page = await cms.create(owner, {
        kind: "page",
        title: "Theme home",
        slug: "home",
        locale: "en",
        templateId: "home",
      });
      await cms.publish(owner, {
        id: page.id,
        locale: "en",
        expectedRevisionId: page.draft.id,
      });
      const privateImage = await media.upload(owner, {
        filename: "synthetic-theme.png",
        title: "Synthetic private theme fixture",
        bytes: await sharp({
          create: { width: 4, height: 4, channels: 3, background: "#345678" },
        })
          .png()
          .toBuffer(),
      });
      const events = new EventService(db, new AuthorizationService(db));
      await events.create(owner, {
        title: "Synthetic protected event",
        description: "Private planning",
        startsAt: "2026-12-01T12:00:00Z",
        endsAt: null,
        timezone: "Europe/Paris",
        venue: "Synthetic venue",
        visibility: "private",
        managerUserId: member.userId,
      });
      // A legacy settings object has no theme ID; parsing keeps its font and accent.
      const { themeId: _themeId, ...legacy } = defaultSiteSettings;
      void _themeId;
      let site = await cms.saveSite(owner, {
        locale: "en",
        expectedVersion: 0,
        settings: {
          ...legacy,
          font: "serif",
          accentColor: "#365678",
          homePageId: page.id,
          navigation: [{ pageId: page.id, label: "Live home" }],
          footerText: "Live footer",
        },
      });
      site = await cms.publishSite(owner, {
        locale: "en",
        expectedVersion: site.version,
      });
      const publicBefore = await cms.publicSite("en");
      expect(publicBefore).toMatchObject({
        themeId: "default",
        font: "serif",
        accentColor: "#365678",
      });
      const preserved = async () => {
        const result: Record<string, unknown> = {};
        for (const table of [
          "cms_content",
          "cms_variant",
          "cms_revision",
          "membership",
          "media_asset",
          "media_usage",
          "event",
          "event_manager",
          "form",
          "form_version",
          "form_submission",
          "form_notification",
        ]) {
          result[table] = (
            await migrationPool.query(
              `SELECT to_jsonb(t) AS row FROM club.${table} t ORDER BY to_jsonb(t)::text`,
            )
          ).rows;
        }
        return result;
      };
      const before = await preserved();
      site = await cms.saveSite(owner, {
        locale: "en",
        expectedVersion: site.version,
        settings: {
          ...site.draft,
          themeId: "minimal",
          navigation: [],
          footerText: "Unpublished footer",
        },
      });
      await expect(cms.previewSite(member, "en")).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(
        cms.activateAppearance(member, {
          locale: "en",
          expectedVersion: site.version,
        }),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      expect(await cms.publicSite("en")).toEqual(publicBefore);
      expect(await cms.previewSite(owner, "en")).toEqual({
        ...publicBefore,
        themeId: "minimal",
      });
      const version = site.version;
      const competing = await Promise.allSettled(
        ["minimal", "minimal"].map(() =>
          cms.activateAppearance(owner, {
            locale: "en",
            expectedVersion: version,
          }),
        ),
      );
      expect(
        competing.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        competing.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
      site = await cms.getSite(owner, "en");
      expect(await cms.publicSite("en")).toEqual({
        ...publicBefore,
        themeId: "minimal",
      });
      expect(site.draft.navigation).toEqual([]);
      expect(site.draft.footerText).toBe("Unpublished footer");
      expect(await preserved()).toEqual(before);
      await expect(media.read(null, privateImage.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        cms.restoreAppearance(member, {
          locale: "en",
          expectedVersion: site.version,
        }),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      site = await cms.restoreAppearance(owner, {
        locale: "en",
        expectedVersion: site.version,
      });
      expect((await cms.publicSite("en")).themeId).toBe("minimal");
      expect(site.draft).toMatchObject({
        themeId: "default",
        footerText: "Unpublished footer",
        navigation: [],
      });
      await cms.activateAppearance(owner, {
        locale: "en",
        expectedVersion: site.version,
      });
      expect(await cms.publicSite("en")).toEqual(publicBefore);
      expect(await preserved()).toEqual(before);
      await db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, owner.userId));
      await expect(cms.previewSite(owner, "en")).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
    });

    it("copies templates once and refuses incompatible content or hidden feature input without discarding data", async () => {
      const { cms, migrationPool, installedClub } = context();
      const { owner } = await installedClub();
      const page = await cms.create(owner, {
        kind: "page",
        title: "Editable copy",
        slug: "copy",
        locale: "en",
        templateId: "about",
      });
      const another = copyPageTemplate("about");
      expect(another.content[0].props.id).not.toBe(
        page.draft.data.content[0].props.id,
      );
      const template = starterPages.find((item) => item.slug === "about")!;
      const originalHeading = template.heading;
      try {
        template.heading = "A later template release";
        expect((await cms.detail(owner, page.id, "en")).draft).toEqual(
          page.draft,
        );
        expect(copyPageTemplate("about").content[0].props).toHaveProperty(
          "title",
          template.heading,
        );
      } finally {
        template.heading = originalHeading;
      }
      expect(await cms.publicPage("en", "copy")).toBeNull();
      await expect(
        cms.create(owner, {
          kind: "page",
          title: "Invalid",
          slug: "invalid",
          locale: "en",
          templateId: "unknown",
        }),
      ).rejects.toThrow();
      let site = await cms.saveSite(owner, {
        locale: "en",
        expectedVersion: 0,
        settings: defaultSiteSettings,
      });
      await expect(
        cms.saveSite(owner, {
          locale: "en",
          expectedVersion: site.version,
          settings: { ...site.draft, eventFeatures: ["registration"] },
        }),
      ).rejects.toThrow();
      site = await cms.saveSite(owner, {
        locale: "en",
        expectedVersion: site.version,
        settings: { ...site.draft, themeId: "minimal" },
      });
      const incompatible = {
        ...page.draft.data,
        content: [
          { type: "FutureBlock", props: { id: "keep-me", version: 99 } },
        ],
      };
      await migrationPool.query(
        "UPDATE club.cms_revision SET data=$1 WHERE id=$2",
        [JSON.stringify(incompatible), page.draft.id],
      );
      const before = await cms.getSite(owner, "en");
      for (const operation of [
        () =>
          cms.activateAppearance(owner, {
            locale: "en",
            expectedVersion: site.version,
          }),
        () =>
          cms.publishSite(owner, {
            locale: "en",
            expectedVersion: site.version,
          }),
        () => cms.previewSite(owner, "en"),
      ]) {
        await expect(operation()).rejects.toMatchObject({
          code: "THEME_CONTENT_UNSUPPORTED",
        });
      }
      expect(await cms.getSite(owner, "en")).toEqual(before);
      expect(
        (
          await migrationPool.query(
            "SELECT data FROM club.cms_revision WHERE id=$1",
            [page.draft.id],
          )
        ).rows[0].data,
      ).toEqual(incompatible);
    });
  });
}
