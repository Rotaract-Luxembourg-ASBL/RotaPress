import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditEntry, membership } from "../../db/schema/club";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import type { CmsService } from "../../src/features/cms/CmsService";
import {
  defaultSiteSettings,
  type CmsDetail,
  type SiteSettings,
} from "../../src/features/cms/cms_schemas";
import { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import type { AutomationPrincipal } from "../../src/integrations/automation/AutomationAccess";
import { WebsiteManagementService } from "../../src/integrations/automation/WebsiteManagementService";

type Context = {
  db: Database;
  cms: CmsService;
  authorization: AuthorizationService;
  installedClub: () => Promise<{
    owner: TrustedActor;
    scope: { organizationId: string };
  }>;
};
const version = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const target = (page: CmsDetail) => ({ ...version(page), confirmed: true });

export function automationWebsiteArchiveChecks(context: () => Context) {
  describe("C14 website archive", () => {
    async function fixture() {
      const ctx = context();
      const { owner, scope } = await ctx.installedClub();
      const principal: AutomationPrincipal = {
        actor: owner,
        keyId: "website-archive-domain-fixture",
        organizationId: scope.organizationId,
        scopes: ["website:manage", "website:publish"],
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
        title: "Unused page",
        slug: "unused-page",
      });
      await ctx.cms.publish(owner, version(page));
      return { ...ctx, owner, principal, service, page };
    }

    it("requires both grants, explicit confirmation, current club and current staff authority", async () => {
      const { db, cms, owner, principal, service, page } = await fixture();
      for (const scope of ["website:manage", "website:publish"] as const)
        await expect(
          service.archive({ ...principal, scopes: [scope] }, target(page)),
        ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
      for (const confirmed of [undefined, false])
        await expect(
          service.archive(principal, { ...target(page), confirmed }),
        ).rejects.toThrow();
      await expect(
        service.archive(
          { ...principal, organizationId: randomUUID() },
          target(page),
        ),
      ).rejects.toMatchObject({ code: "AUTOMATION_ORGANIZATION_CHANGED" });
      await expect(
        service.archive(principal, { ...target(page), id: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
      await db
        .update(membership)
        .set({ role: "member" })
        .where(eq(membership.userId, owner.userId));
      await expect(
        service.archive(principal, target(page)),
      ).rejects.toMatchObject({ status: 403 });
      await db
        .update(membership)
        .set({ role: "owner", status: "suspended" })
        .where(eq(membership.userId, owner.userId));
      await expect(
        service.archive(principal, target(page)),
      ).rejects.toMatchObject({ status: 403 });
      expect(await cms.publicPage("en", "unused-page")).not.toBeNull();
    });

    it("rejects stale revisions and preserves history while removing only the identified publication", async () => {
      const { db, cms, owner, principal, service, page } = await fixture();
      const other = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Keep page",
        slug: "keep-page",
      });
      await cms.publish(owner, version(other));
      const latest = await cms.save(owner, {
        ...version(page),
        title: "Latest unused page",
        slug: page.draft.slug,
        description: page.draft.description,
        socialImageId: page.draft.socialImageId,
        data: page.draft.data,
      });
      await expect(
        service.archive(principal, target(page)),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
      expect((await cms.detail(owner, page.id, "en")).archived).toBe(false);
      expect(await cms.publicPage("en", "unused-page")).not.toBeNull();
      const archived = await service.archive(principal, target(latest));
      expect(archived.archived).toBe(true);
      expect(archived.draft.id).toBe(latest.draft.id);
      expect(archived.publishedRevisionId).toBeNull();
      expect(archived.revisions.map((revision) => revision.id)).toEqual(
        latest.revisions.map((revision) => revision.id),
      );
      expect(await cms.publicPage("en", "unused-page")).toBeNull();
      expect(await cms.publicPage("en", "keep-page")).not.toBeNull();
      expect(
        (await cms.list(owner)).find((item) => item.id === page.id)?.archived,
      ).toBe(true);
      expect(
        await db
          .select()
          .from(auditEntry)
          .where(
            and(
              eq(auditEntry.targetId, page.id),
              eq(auditEntry.action, "cms.archived"),
            ),
          ),
      ).toHaveLength(1);
      await expect(
        service.archive(principal, target(latest)),
      ).rejects.toMatchObject({ code: "CONTENT_ARCHIVED" });
      await expect(
        service.restore(principal, {
          ...version(latest),
          revisionId: page.draft.id,
        }),
      ).rejects.toMatchObject({ code: "CONTENT_ARCHIVED" });
    });

    it("requires removal from both draft and published home, menu and Events selections", async () => {
      const { cms, owner, principal, service, page } = await fixture();
      const references: SiteSettings[] = [
        { ...defaultSiteSettings, homePageId: page.id },
        {
          ...defaultSiteSettings,
          navigation: [{ pageId: page.id, label: "Unused" }],
        },
        { ...defaultSiteSettings, eventsPageId: page.id },
      ];
      let site = await cms.getSite(owner, "en");
      for (const settings of references) {
        site = await cms.saveSite(owner, {
          locale: "en",
          expectedVersion: site.version,
          settings,
        });
        await expect(
          service.archive(principal, target(page)),
        ).rejects.toMatchObject({ code: "AUTOMATION_ARCHIVE_PAGE_IN_USE" });
        site = await cms.publishSite(owner, {
          locale: "en",
          expectedVersion: site.version,
        });
        site = await cms.saveSite(owner, {
          locale: "en",
          expectedVersion: site.version,
          settings: defaultSiteSettings,
        });
        await expect(
          service.archive(principal, target(page)),
        ).rejects.toMatchObject({ code: "AUTOMATION_ARCHIVE_PAGE_IN_USE" });
        site = await cms.publishSite(owner, {
          locale: "en",
          expectedVersion: site.version,
        });
      }
      expect((await service.archive(principal, target(page))).archived).toBe(
        true,
      );
      const home = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Home",
        slug: "home",
      });
      await cms.publish(owner, version(home));
      await expect(
        service.archive(principal, target(home)),
      ).rejects.toMatchObject({ code: "AUTOMATION_ARCHIVE_PAGE_IN_USE" });
      expect((await cms.publicHome("en")).page?.id).toBe(home.id);
    });

    it("rejects multilingual, reusable, shared and event-owned content without removing any variant", async () => {
      const { cms, authorization, db, owner, principal, service, page } =
        await fixture();
      const translated = await cms.addLocale(owner, {
        id: page.id,
        locale: "fr",
        title: "Page inutilisée",
        slug: "page-inutilisee",
      });
      await cms.publish(owner, version(translated));
      await expect(
        service.archive(principal, target(page)),
      ).rejects.toMatchObject({ code: "AUTOMATION_ARCHIVE_MULTILINGUAL" });
      expect(await cms.publicPage("en", "unused-page")).not.toBeNull();
      expect(await cms.publicPage("fr", "page-inutilisee")).not.toBeNull();
      for (const kind of ["section", "header", "footer"] as const) {
        const part = await cms.create(owner, {
          kind,
          locale: "en",
          title: kind,
          slug: kind,
        });
        await expect(
          service.archive(principal, target(part)),
        ).rejects.toMatchObject({ code: "AUTOMATION_ARCHIVE_PAGE_ONLY" });
        expect((await cms.detail(owner, part.id, "en")).archived).toBe(false);
      }
      const events = new EventService(db, authorization);
      const event = await events.create(owner, {
        title: "Keep event",
        description: "Synthetic event",
        startsAt: "2026-12-01T17:00:00Z",
        endsAt: null,
        timezone: "Europe/Luxembourg",
        venue: "Community room",
        visibility: "public",
        managerUserId: owner.userId,
      });
      const modules = new EventModuleService(db, events);
      await modules.change(owner, {
        id: event.id,
        expectedVersion: event.version,
        key: "website",
        operation: "enable",
        confirmed: true,
      });
      const eventPage = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Event page",
        slug: "event-page",
        event: { id: event.id, moduleKey: "website" },
      });
      await expect(
        service.archive(principal, target(eventPage)),
      ).rejects.toMatchObject({ code: "AUTOMATION_ARCHIVE_PAGE_ONLY" });
      expect((await cms.detail(owner, eventPage.id, "en")).archived).toBe(
        false,
      );
    });
  });
}
