import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { PartnerReader } from "../../src/features/partners/PartnerReader";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  StaffAccess,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import { CmsPartnerUsage } from "../../src/features/cms/CmsPartnerUsage";
import { PartnerService } from "../../src/features/partners/PartnerService";
import type { PartnerDto } from "../../src/features/partners/partner_schemas";
import type { MediaService } from "../../src/features/media/MediaService";
import {
  cmsDataSchema,
  type CmsData,
  type CmsDetail,
} from "../../src/features/cms/cms_schemas";

type Context = {
  db: Database;
  cms: CmsService;
  media: MediaService;
  authorization: AuthorizationService;
  actor(label: string): Promise<TrustedActor>;
  installedClub(): Promise<{ owner: TrustedActor; scope: StaffAccess }>;
};
const profile = {
  name: "Synthetic shared partner",
  description: "A synthetic profile",
  category: "partner" as const,
  website: "https://example.test",
  logoId: null,
};
const action = (row: PartnerDto) => ({
  expectedVersion: row.version,
  confirmed: true,
});
const pageAction = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const save = (page: CmsDetail, data: CmsData) => ({
  ...pageAction(page),
  title: page.draft.title,
  slug: page.draft.slug,
  description: "",
  socialImageId: null,
  data,
});
const collection = (id: string): CmsData => ({
  root: { props: {} },
  content: [
    {
      type: "PartnerCollection",
      props: {
        id: "partners",
        version: 1,
        title: "Supporters",
        partnerIds: [id],
        presentation: "cards",
      },
    },
  ],
});

export function partnerChecks(get: () => Context) {
  describe("C03 managed partners and block design", () => {
    it("projects only published profiles in automatic categories and removes unpublished team profiles", async () => {
      const { db, cms, media, authorization, installedClub } = get();
      const { owner } = await installedClub();
      const partners = new PartnerService(
        db,
        authorization,
        media,
        new CmsPartnerUsage(),
      );
      let team = await partners.create(owner, {
        ...profile,
        name: "Synthetic team member",
        category: "team",
        role: "Chair",
      });
      await partners.create(owner, {
        ...profile,
        name: "Private team draft",
        category: "team",
      });
      const sponsor = await partners.create(owner, {
        ...profile,
        category: "sponsor",
      });
      await partners.change(owner, sponsor.id, "publish", action(sponsor));
      team = await partners.change(owner, team.id, "publish", action(team));
      let page = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Our people",
        slug: "our-people",
      });
      page = await cms.save(
        owner,
        save(page, {
          root: { props: {} },
          content: [
            {
              type: "PartnerCollection",
              props: {
                id: "team",
                version: 1,
                title: "Meet the team",
                presentation: "cards",
                selectionMode: "category",
                category: "team",
                partnerIds: [],
              },
            },
          ],
        }),
      );
      await cms.publish(owner, pageAction(page));
      expect(
        Object.keys((await cms.publicPage("en", "our-people"))!.partners!),
      ).toEqual([team.id]);
      expect(
        (await cms.publicPage("en", "our-people"))!.partners![team.id].role,
      ).toBe("Chair");
      expect(
        (await partners.list(owner))
          .find((item) => item.id === team.id)!
          .placements.every((item) => item.dynamic),
      ).toBe(true);
      await partners.change(owner, team.id, "unpublish", action(team));
      expect((await cms.publicPage("en", "our-people"))!.partners).toEqual({});
    });

    it("keeps shared drafts private, publishes to multiple references, blocks in-use unpublication, and restores only to draft", async () => {
      const { db, cms, media, authorization, installedClub } = get();
      const { owner } = await installedClub();
      const partners = new PartnerService(
        db,
        authorization,
        media,
        new CmsPartnerUsage(),
      );
      let record = await partners.create(owner, profile);
      let page = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Partners",
        slug: "partners",
      });
      page = await cms.save(owner, save(page, collection(record.id)));
      await expect(cms.publish(owner, pageAction(page))).rejects.toMatchObject({
        code: "PARTNER_NOT_PUBLISHED",
      });
      expect(await cms.publicPage("en", "partners")).toBeNull();
      record = await partners.change(
        owner,
        record.id,
        "publish",
        action(record),
      );
      page = await cms.publish(owner, pageAction(page));
      let section = await cms.create(owner, {
        kind: "section",
        locale: "en",
        title: "Shared supporters",
        slug: "shared-supporters",
      });
      section = await cms.save(owner, save(section, collection(record.id)));
      section = await cms.publish(owner, pageAction(section));
      let second = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Second",
        slug: "second",
      });
      second = await cms.save(
        owner,
        save(second, {
          root: { props: {} },
          content: [
            {
              type: "SharedSection",
              props: { id: "shared", version: 1, sectionId: section.id },
            },
          ],
        }),
      );
      await cms.publish(owner, pageAction(second));
      const before = page.draft.data;
      const originalVersion = record.version;
      record = await partners.change(owner, record.id, "save", {
        expectedVersion: record.version,
        profile: { ...profile, name: "Private replacement" },
      });
      expect(
        (await cms.publicPage("en", "partners"))?.partners?.[record.id].name,
      ).toBe(profile.name);
      expect(
        (await cms.publicPage("en", "second"))?.partners?.[record.id].name,
      ).toBe(profile.name);
      await expect(
        partners.change(owner, record.id, "publish", {
          expectedVersion: originalVersion,
          confirmed: true,
        }),
      ).rejects.toMatchObject({ code: "PARTNER_CONFLICT" });
      await expect(
        partners.change(owner, record.id, "publish", {
          expectedVersion: record.version,
        }),
      ).rejects.toThrow();
      record = await partners.change(
        owner,
        record.id,
        "publish",
        action(record),
      );
      expect(record.placements.map((placement) => placement.id).sort()).toEqual(
        [page.id, section.id].sort(),
      );
      expect(
        (await cms.publicPage("en", "second"))?.partners?.[record.id].name,
      ).toBe("Private replacement");
      expect((await cms.detail(owner, page.id, "en")).draft.data).toEqual(
        before,
      );
      await expect(
        partners.change(owner, record.id, "unpublish", action(record)),
      ).rejects.toMatchObject({ code: "PARTNER_IN_USE" });
      record = await partners.change(owner, record.id, "restore", {
        expectedVersion: record.version,
      });
      expect(record.draft.name).toBe(profile.name);
      expect(
        (await cms.publicPage("en", "partners"))?.partners?.[record.id].name,
      ).toBe("Private replacement");
      record = await partners.change(
        owner,
        record.id,
        "publish",
        action(record),
      );
      expect(
        (await cms.publicPage("en", "partners"))?.partners?.[record.id].name,
      ).toBe(profile.name);
      const repeated = await partners.change(
        owner,
        record.id,
        "publish",
        action(record),
      );
      expect(repeated.previous).toEqual(record.previous);
      expect(repeated.version).toBe(record.version);
      let site = await cms.getSite(owner, "en");
      site = await cms.saveSite(owner, {
        locale: "en",
        expectedVersion: site.version,
        settings: { ...site.draft, themeId: "minimal" },
      });
      await cms.activateAppearance(owner, {
        locale: "en",
        expectedVersion: site.version,
      });
      expect((await cms.publicPage("en", "partners"))?.data).toEqual(before);
      expect((await partners.list(owner))[0]).toEqual(record);
    });

    it("enforces current membership and organization scope and keeps selected private logos protected", async () => {
      const { db, cms, media, authorization, installedClub, actor } = get();
      const { owner, scope } = await installedClub();
      const partners = new PartnerService(
        db,
        authorization,
        media,
        new CmsPartnerUsage(),
      );
      const member = await actor("partner-member");
      await db.insert(membership).values({
        organizationId: scope.organizationId,
        userId: member.userId,
        role: "member",
        status: "approved",
      });
      const logo = await media.upload(owner, {
        filename: "synthetic-logo.png",
        title: "Synthetic logo",
        alt: "",
        caption: "",
        tags: [],
        collection: "",
        bytes: await sharp({
          create: { width: 30, height: 30, channels: 3, background: "#25636b" },
        })
          .png()
          .toBuffer(),
      });
      let row = await partners.create(owner, { ...profile, logoId: logo.id });
      await expect(partners.list(member)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(
        partners.change(member, row.id, "publish", action(row)),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      await expect(
        partners.change(owner, row.id, "publish", action(row)),
      ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
      expect(await partners.publishedSelection(scope.organizationId)).toEqual(
        [],
      );
      await media.update(owner, { id: logo.id, visibility: "public" });
      row = await partners.change(owner, row.id, "publish", action(row));
      await expect(
        media.update(owner, { id: logo.id, visibility: "private" }),
      ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
      await expect(
        new PartnerReader().assertReferences(randomUUID(), [row.id], true, db),
      ).rejects.toMatchObject({ code: "PARTNER_UNAVAILABLE" });
      const page = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Scope",
        slug: "scope",
      });
      await expect(
        partners.change(owner, randomUUID(), "save", {
          expectedVersion: 1,
          profile,
        }),
      ).rejects.toMatchObject({ code: "PARTNER_NOT_FOUND" });
      await expect(
        cms.save(owner, save(page, collection(randomUUID()))),
      ).rejects.toMatchObject({ code: "PARTNER_UNAVAILABLE" });
      expect((await partners.list(owner)).map((item) => item.id)).toEqual([
        row.id,
      ]);
      row = await partners.change(owner, row.id, "unpublish", action(row));
      expect(row.published).toBeNull();
      expect(row.draft.logoId).toBe(logo.id);
    });

    it("accepts only semantic design settings and retains inline sponsor content without a migration", async () => {
      const { cms, installedClub } = get();
      const { owner } = await installedClub();
      const original: CmsData = {
        root: { props: {} },
        content: [
          {
            type: "Sponsors",
            props: {
              id: "legacy",
              version: 1,
              items: [
                { name: "Existing inline sponsor", href: "/", assetId: "" },
              ],
            },
          },
        ],
      };
      expect(cmsDataSchema.parse(original)).toEqual(original);
      const data = cmsDataSchema.parse({
        ...original,
        content: original.content.map((block) => ({
          ...block,
          props: {
            ...block.props,
            design: { tone: "soft", columns: "two", spacing: "comfortable" },
          },
        })),
      });
      let page = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Designed",
        slug: "designed",
      });
      page = await cms.save(owner, save(page, data));
      await cms.publish(owner, pageAction(page));
      expect((await cms.publicPage("en", "designed"))?.data).toEqual(data);
      const invalid = {
        ...data,
        content: data.content.map((block) => ({
          ...block,
          props: {
            ...block.props,
            design: { background: "url(javascript:alert(1))" },
          },
        })),
      };
      await expect(
        cms.save(owner, { ...save(page, data), data: invalid }),
      ).rejects.toThrow();
      expect((await cms.detail(owner, page.id, "en")).draft.data).toEqual(data);
    });
  });
}
