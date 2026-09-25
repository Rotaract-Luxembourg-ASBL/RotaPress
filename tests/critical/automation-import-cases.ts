import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { automationImport } from "../../db/schema/automation";
import { membership } from "../../db/schema/club";
import { ContentImportService } from "../../src/integrations/automation/ContentImportService";
import { RequestLimiter } from "../../src/core/RequestLimiter";
import type { AutomationPrincipal } from "../../src/integrations/automation/AutomationAccess";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";

type Context = {
  db: Database;
  cms: CmsService;
  authorization: AuthorizationService;
  installedClub: () => Promise<{
    owner: TrustedActor;
    scope: { organizationId: string };
  }>;
};
export function automationImportChecks(context: () => Context) {
  describe("C14 atomic private content imports", () => {
    it("counts simultaneous first requests atomically without duplicate-primary-key errors", async () => {
      const limiter = new RequestLimiter(context().db);
      for (let round = 0; round < 4; round++) {
        const identity = randomUUID();
        const results = await Promise.allSettled(
          Array.from({ length: 24 }, () =>
            limiter.consume("automation-concurrency-test", identity, 10),
          ),
        );
        expect(
          results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(10);
        const denied = results
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason);
        expect(denied).toHaveLength(14);
        for (const rejection of denied)
          expect(rejection).toMatchObject({
            code: "RATE_LIMITED",
            status: 429,
          });
      }
    });
    async function fixture() {
      const ctx = context();
      const { owner, scope } = await ctx.installedClub();
      const principal: AutomationPrincipal = {
        actor: owner,
        keyId: "domain-fixture",
        organizationId: scope.organizationId,
        scopes: ["website:write", "website:read"],
        sourceOrigins: ["https://www.rotary.org"],
      };
      const service = new ContentImportService(
        ctx.db,
        ctx.authorization,
        ctx.cms,
      );
      const input = {
        requestId: randomUUID(),
        pages: [
          {
            locale: "en",
            title: "Our work",
            slug: "our-work",
            description: "Club projects",
            sourceUrl: "https://www.rotary.org/en/our-causes",
            sections: [
              {
                heading: "Community",
                text: "<script>secret()</script> & ordinary content",
              },
            ],
          },
        ],
      };
      return { ...ctx, principal, service, input };
    }
    it("serializes concurrent retries and keeps escaped native page drafts private with immutable receipts", async () => {
      const { service, principal, input, cms, db } = await fixture();
      const [a, b] = await Promise.all([
        service.create(principal, input),
        service.create(principal, input),
      ]);
      expect(a).toEqual(b);
      expect(a.status).toBe("private-drafts");
      expect(
        (await cms.list(principal.actor)).filter(
          (page) => page.slug === "our-work",
        ),
      ).toHaveLength(1);
      const detail = await cms.detail(principal.actor, a.pages[0].id, "en");
      expect(detail.publishedRevisionId).toBeNull();
      expect(JSON.stringify(detail.draft.data)).not.toContain("<script>");
      expect(detail.draft.data.content.map((block) => block.type)).toEqual([
        "Heading",
        "RichText",
      ]);
      expect(await cms.publicPage("en", "our-work")).toBeNull();
      expect(await service.receipt(principal, input.requestId)).toEqual(a);
      await expect(
        service.create(principal, {
          ...input,
          pages: [{ ...input.pages[0], title: "Different" }],
        }),
      ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
      await expect(
        db
          .update(automationImport)
          .set({ inputHash: "changed" })
          .where(eq(automationImport.requestId, input.requestId)),
      ).rejects.toThrow();
    });
    it("rolls back the whole batch on duplicate slugs and rejects unapproved source attribution", async () => {
      const { service, principal, input, cms } = await fixture();
      await expect(
        service.create(principal, {
          ...input,
          pages: [input.pages[0], input.pages[0]],
        }),
      ).rejects.toMatchObject({ code: "IMPORT_SLUG_EXISTS" });
      expect(
        (await cms.list(principal.actor)).some(
          (page) => page.slug === "our-work",
        ),
      ).toBe(false);
      await expect(
        service.receipt(principal, input.requestId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.create(principal, {
          ...input,
          pages: [
            { ...input.pages[0], sourceUrl: "https://unapproved.org/page" },
          ],
        }),
      ).rejects.toMatchObject({ status: 403 });
      const saved = await cms.create(principal.actor, {
        kind: "page",
        locale: "en",
        title: "Original",
        slug: "our-work",
      });
      await expect(service.create(principal, input)).rejects.toMatchObject({
        code: "IMPORT_SLUG_EXISTS",
      });
      expect(
        (await cms.detail(principal.actor, saved.id, "en")).draft.title,
      ).toBe("Original");
    });
    it("rechecks current membership even for a previously valid import receipt", async () => {
      const { service, principal, input, db } = await fixture();
      await service.create(principal, input);
      await db
        .update(membership)
        .set({ status: "suspended" })
        .where(
          and(
            eq(membership.userId, principal.actor.userId),
            eq(membership.organizationId, principal.organizationId),
          ),
        );
      await expect(service.create(principal, input)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        service.receipt(principal, input.requestId),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
}
