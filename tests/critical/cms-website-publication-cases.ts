import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import sharp from "sharp";
import { membership } from "../../db/schema/club";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import type { MediaService } from "../../src/features/media/MediaService";
import { defaultSiteSettings } from "../../src/features/cms/cms_schemas";
import { FormService } from "../../src/features/forms/FormService";
import { CmsKitService } from "../../src/features/cms/kits/CmsKitService";
import { WebsiteSetupService } from "../../src/features/cms/WebsiteSetupService";
import type { WebsitePublicationReview } from "../../src/features/cms/website_publication";

type Context = {
  db: Database;
  cms: CmsService;
  media: MediaService;
  authorization: AuthorizationService;
  installedClub: () => Promise<{ owner: TrustedActor }>;
  actor: (name: string) => Promise<TrustedActor>;
};
const command = (review: WebsitePublicationReview) => ({
  scope: review.scope,
  locale: review.locale,
  expectedVersion: review.version,
  confirmed: true,
  pages: review.pages.map(({ id, expectedRevisionId }) => ({
    id,
    expectedRevisionId,
  })),
});

export function websitePublicationChecks(get: () => Context) {
  async function setup() {
    const s = get();
    const { owner } = await s.installedClub();
    const kits = new CmsKitService(
      s.db,
      s.authorization,
      s.media,
      s.cms,
      new FormService(s.db, s.authorization),
      true,
    );
    const website = new WebsiteSetupService(
      s.db,
      s.authorization,
      s.media,
      s.cms,
      kits,
    );
    let page = await s.cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Home",
      slug: "home",
    });
    page = await s.cms.publish(owner, {
      id: page.id,
      locale: "en",
      expectedRevisionId: page.draft.id,
    });
    const saved = await s.cms.saveSite(owner, {
      locale: "en",
      expectedVersion: 0,
      settings: {
        ...defaultSiteSettings,
        homePageId: page.id,
        navigation: [{ label: "Home", pageId: page.id }],
      },
    });
    const site = await s.cms.publishSite(owner, {
      locale: "en",
      expectedVersion: saved.version,
    });
    return { ...s, owner, website, page, site };
  }

  it("C03 menu publication preserves private image and page drafts while a full review names their uses", async () => {
    const s = await setup();
    const asset = await s.media.upload(s.owner, {
      filename: "private-browser-icon.png",
      title: "Synthetic favicon",
      bytes: await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#356476" },
      })
        .png()
        .toBuffer(),
    });
    const edited = await s.cms.save(s.owner, {
      id: s.page.id,
      locale: "en",
      expectedRevisionId: s.page.draft.id,
      title: "Pending homepage",
      slug: s.page.draft.slug,
      description: "",
      data: s.page.draft.data,
      socialImageId: asset.id,
    });
    await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: s.site.version,
      settings: {
        ...s.site.draft,
        themeId: "rotaract-action",
        branding: { ...s.site.draft.branding, iconId: asset.id },
        navigation: [{ label: "Our club", pageId: s.page.id }],
      },
    });
    const full = await s.website.reviewPublication(s.owner, "en", "website");
    expect(full.images).toEqual([
      expect.objectContaining({
        id: asset.id,
        name: "Synthetic favicon",
        status: "private",
        uses: expect.arrayContaining([
          expect.objectContaining({
            label: "Browser icon (favicon) · Branding & appearance",
          }),
          expect.objectContaining({
            label: "Pending homepage · Sharing image",
          }),
        ]),
      }),
    ]);
    await expect(
      s.website.publish(s.owner, command(full)),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    const menu = await s.website.reviewPublication(s.owner, "en", "menu");
    expect(menu.images).toEqual([]);
    expect(menu.problems).toEqual([]);
    expect(menu.pages[0].expectedRevisionId).toBe(s.page.publishedRevisionId);
    const result = await s.website.publish(s.owner, command(menu));
    expect(result.site.published?.navigation).toEqual([
      { label: "Our club", pageId: s.page.id },
    ]);
    expect(result.site.published?.branding.iconId).toBeNull();
    expect(result.site.published?.themeId).toBe(s.site.published?.themeId);
    expect(result.site.draft.branding.iconId).toBe(asset.id);
    expect(result.site.draft.themeId).toBe("rotaract-action");
    const page = await s.cms.detail(s.owner, s.page.id, "en");
    expect(page.publishedRevisionId).toBe(s.page.publishedRevisionId);
    expect(page.draft.id).toBe(edited.draft.id);
    await expect(s.media.read(null, asset.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
    await expect(
      s.website.publish(s.owner, command(menu)),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await s.media.update(s.owner, {
      id: asset.id,
      title: asset.title,
      visibility: "public",
    });
    const ready = await s.website.reviewPublication(s.owner, "en", "website");
    expect(ready.images).toEqual([]);
    const published = await s.website.publish(s.owner, command(ready));
    expect(published.site.published?.branding.iconId).toBe(asset.id);
    expect(
      (await s.cms.detail(s.owner, s.page.id, "en")).publishedRevisionId,
    ).toBe(edited.draft.id);
  });

  it("C03 menu reviews reject unpublished targets, stale page versions and ordinary member access", async () => {
    const s = await setup();
    const menu = await s.website.reviewPublication(s.owner, "en", "menu");
    await expect(
      s.website.publish(s.owner, {
        ...command(menu),
        pages: [{ id: s.page.id, expectedRevisionId: randomUUID() }],
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const draft = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Unpublished destination",
      slug: "new-page",
    });
    await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: s.site.version,
      settings: {
        ...s.site.draft,
        navigation: [{ label: "New page", pageId: draft.id }],
      },
    });
    const review = await s.website.reviewPublication(s.owner, "en", "menu");
    expect(review.problems[0].message).toContain("Unpublished destination");
    await expect(
      s.website.publish(s.owner, command(review)),
    ).rejects.toMatchObject({ code: "NAVIGATION_NOT_PUBLISHED" });
    expect(
      (await s.cms.detail(s.owner, draft.id, "en")).publishedRevisionId,
    ).toBeNull();
    expect((await s.cms.getSite(s.owner, "en")).published).toEqual(
      s.site.published,
    );
    const member = await s.actor("ordinary-member");
    const scope = await s.authorization.require(s.owner, "cms.publish");
    await s.db
      .insert(membership)
      .values({
        organizationId: scope.organizationId,
        userId: member.userId,
        role: "member",
        status: "approved",
      });
    await expect(
      s.website.reviewPublication(member, "en", "website"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      s.website.publish(member, command(review)),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      s.media.publicationIssues(member, [randomUUID()]),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(await s.media.publicationIssues(s.owner, [randomUUID()])).toEqual([
      expect.objectContaining({
        id: null,
        name: "Unavailable image",
        status: "unavailable",
      }),
    ]);
  });
}
