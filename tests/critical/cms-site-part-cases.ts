import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { membership } from "../../db/schema/club";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  StaffAccess,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms";
import type { MediaService } from "../../src/features/media";
import {
  defaultSiteSettings,
  type CmsDetail,
  type CmsData,
} from "../../src/features/cms/cms_schemas";

const action = (part: CmsDetail) => ({
  id: part.id,
  locale: part.locale,
  expectedRevisionId: part.draft.id,
});
const save = (part: CmsDetail, data: unknown) => ({
  ...action(part),
  title: part.draft.title,
  slug: part.draft.slug,
  description: "",
  socialImageId: null,
  data,
});
function withText(part: CmsDetail, text: string): CmsData {
  return {
    ...part.draft.data,
    content: [
      ...part.draft.data.content,
      { type: "RichText", props: { id: "shared-note", version: 1, text } },
    ],
  };
}

export function sitePartChecks(
  context: () => {
    db: Database;
    cms: CmsService;
    media: MediaService;
    actor: (name: string) => Promise<TrustedActor>;
    installedClub: () => Promise<{ owner: TrustedActor; scope: StaffAccess }>;
  },
) {
  describe("C03 shared site parts", () => {
    it("publishes shared revisions deliberately, preserves parts across themes, and resolves the live referenced menu", async () => {
      const { cms, installedClub, actor, db } = context();
      const { owner, scope } = await installedClub();
      const member = await actor("site-part-member");
      await db.insert(membership).values({
        organizationId: scope.organizationId,
        userId: member.userId,
        role: "member",
        status: "approved",
      });
      const pages: CmsDetail[] = [];
      for (const slug of ["home", "about"]) {
        const page = await cms.create(owner, {
          kind: "page",
          locale: "en",
          title: slug,
          slug,
        });
        pages.push(await cms.publish(owner, action(page)));
      }
      let header = await cms.create(owner, {
        kind: "header",
        locale: "en",
        title: "Shared header",
        slug: "shared-header",
      });
      let footer = await cms.create(owner, {
        kind: "footer",
        locale: "en",
        title: "Shared footer",
        slug: "shared-footer",
      });
      expect(header.affectedPages.map((page) => page.id).sort()).toEqual(
        pages.map((page) => page.id).sort(),
      );
      expect(await cms.publicSite("en")).toMatchObject({
        header: null,
        footer: null,
      });
      expect(await cms.publicPage("en", header.draft.slug)).toBeNull();
      expect(await cms.publicSitemap()).toHaveLength(2);
      await expect(
        cms.create(owner, {
          kind: "header",
          locale: "en",
          title: "Second",
          slug: "second",
        }),
      ).rejects.toMatchObject({ code: "SITE_PART_EXISTS" });
      for (const operation of [
        () => cms.preview(member, header.id, "en"),
        () => cms.save(member, save(header, header.draft.data)),
        () => cms.publish(member, action(header)),
        () =>
          cms.restore(member, {
            ...action(header),
            revisionId: header.draft.id,
          }),
      ]) {
        await expect(operation()).rejects.toMatchObject({
          code: "ACCESS_DENIED",
        });
      }
      expect((await cms.preview(owner, header.id, "en")).kind).toBe("header");
      header = await cms.publish(owner, action(header));
      footer = await cms.publish(owner, action(footer));
      const original = header.draft.id;
      const live = await cms.publicSite("en");
      expect(live.header).toEqual(header.draft.data);
      expect(live.footer).toEqual(footer.draft.data);
      header = await cms.save(
        owner,
        save(header, withText(header, "Private shared edit")),
      );
      expect(await cms.publicSite("en")).toEqual(live);
      expect(
        JSON.stringify(await cms.preview(owner, header.id, "en")),
      ).toContain("Private shared edit");
      await expect(
        cms.publish(owner, { ...action(header), expectedRevisionId: original }),
      ).rejects.toMatchObject({ status: 409 });
      header = await cms.publish(owner, action(header));
      expect(JSON.stringify((await cms.publicSite("en")).header)).toContain(
        "Private shared edit",
      );
      header = await cms.restore(owner, {
        ...action(header),
        revisionId: original,
      });
      expect(header.draft.id).not.toBe(original);
      expect(JSON.stringify((await cms.publicSite("en")).header)).toContain(
        "Private shared edit",
      );
      header = await cms.publish(owner, action(header));
      expect((await cms.publicSite("en")).header).toEqual(live.header);
      const fr = await cms.addLocale(owner, {
        id: header.id,
        locale: "fr",
        title: "En-tête",
        slug: "entete",
      });
      expect(fr.publishedRevisionId).toBeNull();
      expect((await cms.publicSite("fr")).header).toBeNull();

      let site = await cms.saveSite(owner, {
        locale: "en",
        expectedVersion: 0,
        settings: {
          ...defaultSiteSettings,
          homePageId: pages[0].id,
          navigation: [{ pageId: pages[1].id, label: "About the club" }],
        },
      });
      site = await cms.publishSite(owner, {
        locale: "en",
        expectedVersion: site.version,
      });
      const partsBefore = [
        await cms.detail(owner, header.id, "en"),
        await cms.detail(owner, footer.id, "en"),
      ];
      site = await cms.saveSite(owner, {
        locale: "en",
        expectedVersion: site.version,
        settings: {
          ...site.draft,
          themeId: "minimal",
          navigation: [{ pageId: pages[0].id, label: "New menu label" }],
        },
      });
      site = await cms.activateAppearance(owner, {
        locale: "en",
        expectedVersion: site.version,
      });
      expect(await cms.publicSite("en")).toMatchObject({
        themeId: "minimal",
        header: live.header,
        footer: live.footer,
        navigation: [{ label: "About the club", href: "/pages/en/about" }],
      });
      expect([
        await cms.detail(owner, header.id, "en"),
        await cms.detail(owner, footer.id, "en"),
      ]).toEqual(partsBefore);
      await cms.publishSite(owner, {
        locale: "en",
        expectedVersion: site.version,
      });
      expect((await cms.publicSite("en")).navigation).toEqual([
        { label: "New menu label", href: "/pages/en/home" },
      ]);
      expect((await cms.detail(owner, header.id, "en")).draft.id).toBe(
        header.draft.id,
      );
      await cms.unpublish(owner, action(pages[0]));
      expect((await cms.publicSite("en")).navigation).toEqual([]);
      await cms.unpublish(owner, action(header));
      expect(await cms.publicSite("en")).toMatchObject({
        header: null,
        footer: live.footer,
      });
    });

    it("validates nested content, protects private logos, and rejects unsupported blocks without replacing the saved draft", async () => {
      const { cms, media, installedClub } = context();
      const { owner } = await installedClub();
      let header = await cms.create(owner, {
        kind: "header",
        locale: "en",
        title: "Logo header",
        slug: "logo-header",
      });
      const asset = await media.upload(owner, {
        filename: "synthetic-logo.png",
        title: "Synthetic logo",
        bytes: await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#25636b" },
        })
          .png()
          .toBuffer(),
      });
      const data = structuredClone(header.draft.data);
      const row = data.content[0];
      if (row.type !== "SiteRow")
        throw new Error("Expected a site row starter");
      const logo = row.props.left[0];
      if (logo.type !== "SiteBrand") throw new Error("Expected a logo starter");
      logo.props.assetId = asset.id;
      logo.props.templateBrand = "rotaract";
      row.props.right.push({
        type: "RichText",
        props: {
          id: "safe-text",
          version: 1,
          text: '<p>Safe<script>alert(1)</script><a href="javascript:alert(1)">link</a></p>',
        },
      });
      header = await cms.save(owner, save(header, data));
      expect(JSON.stringify(header.draft.data)).not.toMatch(
        /javascript:|<script/,
      );
      expect((await cms.preview(owner, header.id, "en")).data).toEqual(
        header.draft.data,
      );
      await expect(cms.publish(owner, action(header))).rejects.toMatchObject({
        code: "MEDIA_NOT_PUBLIC",
      });
      expect((await cms.publicSite("en")).header).toBeNull();
      await media.update(owner, { id: asset.id, visibility: "public" });
      header = await cms.publish(owner, action(header));
      await expect(
        media.update(owner, { id: asset.id, visibility: "private" }),
      ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
      for (const badBlock of [
        {
          type: "SiteMenu",
          props: {
            id: "bad",
            version: 1,
            menuKey: "unknown",
            label: "Menu",
            layout: "horizontal",
          },
        },
        {
          type: "SiteContact",
          props: {
            id: "bad",
            version: 1,
            title: "Contact",
            email: "javascript:alert(1)",
            phone: "",
            address: "",
          },
        },
        { type: "UnknownPlugin", props: { id: "bad", version: 1 } },
        row,
      ]) {
        await expect(
          cms.save(
            owner,
            save(header, {
              ...data,
              content: [
                { ...row, props: { ...row.props, center: [badBlock] } },
              ],
            }),
          ),
        ).rejects.toThrow();
      }
      await expect(
        cms.save(
          owner,
          save(header, {
            ...data,
            content: [
              {
                type: "Form",
                props: {
                  id: "unsupported",
                  version: 1,
                  formId: crypto.randomUUID(),
                },
              },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: "BLOCK_SCOPE_INVALID" });
      expect((await cms.detail(owner, header.id, "en")).draft.id).toBe(
        header.draft.id,
      );
      expect((await cms.publicSite("en")).header).toEqual(header.draft.data);
      const page = await cms.create(owner, {
        kind: "page",
        locale: "en",
        title: "Regular page",
        slug: "regular",
      });
      await expect(
        cms.save(owner, save(page, header.draft.data)),
      ).rejects.toMatchObject({ code: "BLOCK_SCOPE_INVALID" });
    });
  });
}
