import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import {
  defaultSiteSettings,
  emptyCmsData,
  type CmsDetail,
} from "../../src/features/cms/cms_schemas";
import type { AutomationPrincipal } from "../../src/integrations/automation/AutomationAccess";
import { WebsiteManagementService } from "../../src/integrations/automation/WebsiteManagementService";
import { websiteRevisionOutput } from "../../src/integrations/automation/website_management_schemas";

type Context = {
  db: Database;
  cms: CmsService;
  authorization: AuthorizationService;
  installedClub: () => Promise<{
    owner: TrustedActor;
    scope: { organizationId: string };
  }>;
};
const expected = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const save = (page: CmsDetail, title: string) => ({
  ...expected(page),
  title,
  slug: page.draft.slug,
  description: page.draft.description,
  socialImageId: page.draft.socialImageId,
  data: page.draft.data,
});

export function automationWebsiteChecks(context: () => Context) {
  describe("C14 website draft management", () => {
    async function fixture() {
      const ctx = context();
      const { owner, scope } = await ctx.installedClub();
      const principal: AutomationPrincipal = {
        actor: owner,
        keyId: "website-management-domain-fixture",
        organizationId: scope.organizationId,
        scopes: ["website:read", "website:manage", "website:settings"],
        sourceOrigins: [],
      };
      const service = new WebsiteManagementService(
        ctx.db,
        ctx.authorization,
        ctx.cms,
      );
      const page = await ctx.cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Projects",
        slug: "projects",
      });
      return { ...ctx, owner, principal, service, page };
    }

    it("copies one exact source revision atomically, preserving publication and rejecting stale or changed retries", async () => {
      const { cms, owner, principal, service, page } = await fixture();
      await cms.publish(owner, expected(page));
      const input = {
        ...expected(page),
        requestId: randomUUID(),
        title: "More projects",
        slug: "more-projects",
      };
      const [first, retry] = await Promise.all([
        service.duplicate(principal, input),
        service.duplicate(principal, input),
      ]);
      expect(retry).toEqual(first);
      expect(
        (await cms.list(owner)).filter((item) => item.slug === input.slug),
      ).toHaveLength(1);
      const copy = await cms.detail(owner, first.pages[0].id, "en");
      expect(copy.publishedRevisionId).toBeNull();
      expect(copy.draft.data).toEqual(page.draft.data);
      expect(await cms.publicPage("en", input.slug)).toBeNull();
      expect((await cms.publicPage("en", "projects"))?.title).toBe("Projects");
      await expect(
        service.duplicate(principal, { ...input, title: "Changed retry" }),
      ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
      await cms.save(owner, save(page, "A newer source"));
      await expect(
        service.duplicate(principal, {
          ...input,
          requestId: randomUUID(),
          slug: "another-copy",
        }),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      expect(await service.duplicate(principal, input)).toEqual(first);
    });

    it("reads only a revision in the requested content/language and restores privately with a current version", async () => {
      const { cms, owner, principal, service, page } = await fixture();
      await cms.publish(owner, expected(page));
      const latest = await cms.save(owner, save(page, "Unpublished changes"));
      const read = await cms.revision(owner, {
        id: page.id,
        locale: "en",
        revisionId: page.draft.id,
      });
      expect(websiteRevisionOutput.parse(read).revision.title).toBe("Projects");
      expect(JSON.stringify(read)).not.toContain(owner.userId);
      const other = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Other",
        slug: "other",
      });
      await expect(
        cms.revision(owner, {
          id: other.id,
          locale: "en",
          revisionId: page.draft.id,
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        cms.revision(owner, {
          id: page.id,
          locale: "fr",
          revisionId: page.draft.id,
        }),
      ).rejects.toMatchObject({ status: 404 });
      const restore = { ...expected(latest), revisionId: page.draft.id };
      const restored = await service.restore(principal, restore);
      expect(restored.draft.id).not.toBe(page.draft.id);
      expect(restored.draft.title).toBe("Projects");
      expect(restored.publishedRevisionId).toBe(page.draft.id);
      await expect(service.restore(principal, restore)).rejects.toMatchObject({
        code: "REVISION_CONFLICT",
      });
      expect((await cms.detail(owner, page.id, "en")).draft.id).toBe(
        restored.draft.id,
      );
    });

    it("blocks nested executable content in copies and historical restoration without writing drafts", async () => {
      const { cms, owner, principal, service, page } = await fixture();
      const coded = await cms.save(owner, {
        ...save(page, "Manual widget"),
        data: {
          root: { props: {} },
          content: [
            {
              type: "Columns",
              props: {
                id: "columns",
                version: 1,
                ratio: "balanced",
                right: [],
                left: [
                  {
                    type: "CustomCode",
                    props: {
                      id: "widget",
                      version: 1,
                      title: "Manual widget",
                      height: 200,
                      html: "<button>Widget</button>",
                      css: "",
                      javascript: "window.example=1",
                    },
                  },
                ],
              },
            },
          ],
        },
      });
      await expect(
        service.duplicate(principal, {
          ...expected(coded),
          requestId: randomUUID(),
          title: "Unsafe copy",
          slug: "unsafe-copy",
        }),
      ).rejects.toMatchObject({ code: "AUTOMATION_CODE_DISABLED" });
      await expect(
        service.publish(
          { ...principal, scopes: ["website:publish"] },
          { ...expected(coded), confirmed: true },
        ),
      ).rejects.toMatchObject({ code: "AUTOMATION_CODE_DISABLED" });
      const clean = await cms.save(owner, {
        ...save(coded, "Clean content"),
        data: emptyCmsData,
      });
      await expect(
        service.restore(principal, {
          ...expected(clean),
          revisionId: coded.draft.id,
        }),
      ).rejects.toMatchObject({ code: "AUTOMATION_CODE_DISABLED" });
      expect((await cms.detail(owner, page.id, "en")).draft.id).toBe(
        clean.draft.id,
      );
      expect(
        (await cms.list(owner)).some((item) => item.slug === "unsafe-copy"),
      ).toBe(false);
    });

    it("adds only missing private languages and keeps versioned site/menu/appearance changes private", async () => {
      const { cms, owner, principal, service, page } = await fixture();
      const input = {
        id: page.id,
        locale: "fr",
        title: "Projets",
        slug: "projets",
      };
      const translated = await service.addLocale(principal, input);
      expect(translated.publishedRevisionId).toBeNull();
      expect(translated.draft.data).toEqual(emptyCmsData);
      await expect(service.addLocale(principal, input)).rejects.toMatchObject({
        code: "LOCALE_EXISTS",
      });
      await cms.publish(owner, expected(page));
      const before = await cms.saveSite(owner, {
        locale: "en",
        expectedVersion: 0,
        settings: { ...defaultSiteSettings, homePageId: page.id },
      });
      const published = await cms.publishSite(owner, {
        locale: "en",
        expectedVersion: before.version,
      });
      const settings = {
        ...published.draft,
        accentColor: "#112233",
        navigation: [{ pageId: page.id, label: "Projects" }],
      };
      const changed = await service.saveSettings(principal, {
        locale: "en",
        expectedVersion: published.version,
        settings,
      });
      expect(changed.draft.accentColor).toBe("#112233");
      expect(changed.draft.navigation).toEqual(settings.navigation);
      expect(changed.published).toEqual(published.published);
      expect((await cms.publicSite("en")).accentColor).not.toBe("#112233");
      await expect(
        service.saveSettings(principal, {
          locale: "en",
          expectedVersion: published.version,
          settings,
        }),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      await expect(
        service.saveSettings(principal, {
          locale: "en",
          expectedVersion: changed.version,
          settings: { ...settings, homePageId: randomUUID() },
        }),
      ).rejects.toMatchObject({ code: "PAGE_NOT_FOUND" });
      await expect(
        service.saveSettings(principal, {
          locale: "en",
          expectedVersion: changed.version,
          settings: {
            ...settings,
            templateSetup: {
              selectedKitId: "rotaract-action",
              installations: [
                {
                  kitId: "rotaract-action",
                  recipes: [
                    { recipe: "home", id: page.id },
                    { recipe: "header", id: randomUUID() },
                    { recipe: "footer", id: randomUUID() },
                  ],
                },
              ],
            },
          },
        }),
      ).rejects.toMatchObject({ code: "AUTOMATION_TEMPLATE_CHANGE_DISABLED" });
    });

    it("publishes only the explicitly confirmed current page revision with a separate grant and current authority", async () => {
      const { db, cms, owner, principal, service, page } = await fixture();
      const publisher: AutomationPrincipal = {
        ...principal,
        scopes: ["website:publish"],
      };
      const input = { ...expected(page), confirmed: true };
      await expect(service.publish(principal, input)).rejects.toMatchObject({
        code: "AUTOMATION_SCOPE_REQUIRED",
      });
      await expect(
        service.publish(publisher, expected(page)),
      ).rejects.toThrow();
      await expect(
        service.publish(publisher, { ...input, confirmed: false }),
      ).rejects.toThrow();
      await expect(
        service.publish({ ...publisher, organizationId: randomUUID() }, input),
      ).rejects.toMatchObject({ code: "AUTOMATION_ORGANIZATION_CHANGED" });
      const translation = await service.addLocale(principal, {
        id: page.id,
        locale: "fr",
        title: "Projets",
        slug: "projets",
      });
      const latest = await cms.save(owner, save(page, "Reviewed projects"));
      await expect(service.publish(publisher, input)).rejects.toMatchObject({
        code: "REVISION_CONFLICT",
      });
      expect(await cms.publicPage("en", "projects")).toBeNull();
      const published = await service.publish(publisher, {
        ...expected(latest),
        confirmed: true,
      });
      expect(published.publishedRevisionId).toBe(latest.draft.id);
      expect((await cms.publicPage("en", "projects"))?.title).toBe(
        "Reviewed projects",
      );
      expect(
        (await cms.detail(owner, translation.id, "fr")).publishedRevisionId,
      ).toBeNull();
      const pending = await cms.save(owner, save(published, "Still private"));
      expect((await cms.publicPage("en", "projects"))?.title).toBe(
        "Reviewed projects",
      );
      await db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, owner.userId));
      await expect(
        service.publish(publisher, {
          ...expected(pending),
          confirmed: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect((await cms.publicPage("en", "projects"))?.title).toBe(
        "Reviewed projects",
      );
    });

    it("publishes menu changes without activating saved appearance or page drafts, and separately publishes settings", async () => {
      const { cms, owner, principal, service, page } = await fixture();
      const publisher: AutomationPrincipal = {
        ...principal,
        scopes: ["website:publish"],
      };
      await service.publish(publisher, { ...expected(page), confirmed: true });
      const initial = await service.saveSettings(principal, {
        locale: "en",
        expectedVersion: 0,
        settings: { ...defaultSiteSettings, homePageId: page.id },
      });
      const input = {
        locale: "en",
        expectedVersion: initial.version,
        scope: "settings",
        confirmed: true,
      };
      await expect(
        service.publishSettings(principal, input),
      ).rejects.toMatchObject({
        code: "AUTOMATION_SCOPE_REQUIRED",
      });
      await expect(
        service.publishSettings(publisher, {
          ...input,
          confirmed: false,
        }),
      ).rejects.toThrow();
      const published = await service.publishSettings(publisher, input);
      await cms.save(owner, save(page, "A page draft to keep private"));
      const changed = await service.saveSettings(principal, {
        locale: "en",
        expectedVersion: published.version,
        settings: {
          ...published.draft,
          accentColor: "#112233",
          navigation: [{ pageId: page.id, label: "Our projects" }],
        },
      });
      const menu = await service.publishSettings(publisher, {
        locale: "en",
        expectedVersion: changed.version,
        scope: "menu",
        confirmed: true,
      });
      expect(menu.published?.navigation).toEqual(changed.draft.navigation);
      expect(menu.published?.accentColor).toBe(
        published.published?.accentColor,
      );
      expect(menu.draft.accentColor).toBe("#112233");
      expect((await cms.publicPage("en", "projects"))?.title).toBe("Projects");
      await expect(
        service.publishSettings(publisher, {
          locale: "en",
          expectedVersion: changed.version,
          scope: "settings",
          confirmed: true,
        }),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      const appearance = await service.publishSettings(publisher, {
        locale: "en",
        expectedVersion: menu.version,
        scope: "settings",
        confirmed: true,
      });
      expect(appearance.published?.accentColor).toBe("#112233");
      expect((await cms.publicPage("en", "projects"))?.title).toBe("Projects");
    });

    it("requires newly granted actions and current club membership even when retrying a successful copy", async () => {
      const { db, owner, principal, service, page } = await fixture();
      const input = {
        ...expected(page),
        requestId: randomUUID(),
        title: "A copy",
        slug: "a-copy",
      };
      await expect(
        service.duplicate({ ...principal, scopes: ["website:write"] }, input),
      ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
      await expect(
        service.saveSettings(
          { ...principal, scopes: ["website:manage"] },
          {
            locale: "en",
            expectedVersion: 0,
            settings: defaultSiteSettings,
          },
        ),
      ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
      await expect(
        service.duplicate(
          { ...principal, organizationId: randomUUID() },
          input,
        ),
      ).rejects.toMatchObject({ code: "AUTOMATION_ORGANIZATION_CHANGED" });
      await service.duplicate(principal, input);
      await db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, owner.userId));
      await expect(service.duplicate(principal, input)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        service.addLocale(principal, {
          id: page.id,
          locale: "fr",
          title: "Projets",
          slug: "projets",
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
}
