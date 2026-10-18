import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import sharp from "sharp";
import { membership } from "../../db/schema/club";
import { clubFeature } from "../../db/schema/features";
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
import { AlbumService } from "../../src/features/media/AlbumService";
import { PartnerService } from "../../src/features/partners/PartnerService";
import { CmsPartnerUsage } from "../../src/features/cms/CmsPartnerUsage";

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

  async function dependencies() {
    const s = await setup();
    const forms = new FormService(s.db, s.authorization);
    const form = await forms.create(s.owner, {
      kind: "contact",
      title: "Reviewed contact form",
    });
    const asset = await s.media.upload(s.owner, {
      filename: "reviewed-photo.png",
      title: "Reviewed private image",
      bytes: await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#356476" },
      })
        .png()
        .toBuffer(),
    });
    const page = await s.cms.save(s.owner, {
      id: s.page.id,
      locale: "en",
      expectedRevisionId: s.page.draft.id,
      title: s.page.draft.title,
      slug: s.page.draft.slug,
      description: "",
      socialImageId: asset.id,
      data: {
        root: { props: {} },
        content: [
          {
            type: "Form",
            props: { id: "contact", version: 1, formId: form.id },
          },
        ],
      },
    });
    const review = await s.website.reviewPublication(s.owner, "en", "website");
    const approved = {
      ...command(review),
      forms: [
        { id: form.id, expectedRevision: form.draftRevision, confirmed: true },
      ],
      assets: [
        {
          id: asset.id,
          expectedRevision: review.images[0].expectedRevision!,
          confirmed: true,
        },
      ],
    };
    return { ...s, forms, form, asset, page, review, approved };
  }

  it("C03 one website review publishes only individually approved form and image dependencies atomically", async () => {
    const s = await dependencies();
    const unrelated = await s.forms.create(s.owner, {
      kind: "contact",
      title: "Unrelated private form",
    });
    expect(s.review.forms).toEqual([
      expect.objectContaining({
        id: s.form.id,
        definition: s.form.draft,
        expectedRevision: s.form.draftRevision,
        status: "draft",
        canPublish: true,
        uses: [
          { label: "Home", href: `/admin/website/${s.page.id}?locale=en` },
        ],
      }),
    ]);
    expect(s.review.images[0]).toMatchObject({
      id: s.asset.id,
      canPublish: true,
      kind: "image",
      metadata: { title: s.asset.title },
    });
    expect(JSON.stringify(s.review.forms)).not.toMatch(
      /recipients|retentionDays|responses|answers/,
    );
    await expect(
      s.website.publish(s.owner, command(s.review)),
    ).rejects.toMatchObject({ code: "FORM_NOT_PUBLISHED" });
    await expect(
      s.website.publish(s.owner, { ...s.approved, assets: [] }),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    expect(
      (await s.forms.detail(s.owner, s.form.id)).publishedVersionId,
    ).toBeNull();
    expect(
      (await s.cms.detail(s.owner, s.page.id, "en")).publishedRevisionId,
    ).toBe(s.page.publishedRevisionId);
    await s.website.publish(s.owner, s.approved);
    expect(
      (await s.forms.detail(s.owner, s.form.id)).publishedVersionNumber,
    ).toBe(s.form.draftRevision);
    expect(
      (await s.forms.detail(s.owner, unrelated.id)).publishedVersionId,
    ).toBeNull();
    expect(
      (await s.cms.detail(s.owner, s.page.id, "en")).publishedRevisionId,
    ).toBe(s.page.draft.id);
    await expect(s.media.read(null, s.asset.id)).resolves.toBeDefined();
  });

  it("C03 website dependency consent rejects unrelated, duplicate, unconfirmed, stale and menu targets", async () => {
    const s = await dependencies();
    const unrelated = await s.forms.create(s.owner, {
      kind: "contact",
      title: "Unrelated private form",
    });
    await expect(
      s.website.publish(s.owner, {
        ...s.approved,
        forms: [
          {
            id: unrelated.id,
            expectedRevision: unrelated.draftRevision,
            confirmed: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "WEBSITE_DEPENDENCY_INVALID" });
    await expect(
      s.website.publish(s.owner, {
        ...s.approved,
        assets: [
          {
            id: randomUUID(),
            expectedRevision: s.approved.assets[0].expectedRevision,
            confirmed: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "WEBSITE_DEPENDENCY_INVALID" });
    await expect(
      s.website.publish(s.owner, {
        ...s.approved,
        forms: [...s.approved.forms, ...s.approved.forms],
      }),
    ).rejects.toThrow();
    await expect(
      s.website.publish(s.owner, {
        ...s.approved,
        assets: [...s.approved.assets, ...s.approved.assets],
      }),
    ).rejects.toThrow();
    await expect(
      s.website.publish(s.owner, {
        ...s.approved,
        forms: [{ ...s.approved.forms[0], confirmed: false }],
      }),
    ).rejects.toThrow();
    await expect(
      s.website.publish(s.owner, { ...s.approved, scope: "menu" }),
    ).rejects.toMatchObject({ code: "WEBSITE_DEPENDENCY_INVALID" });
    await expect(
      s.website.publish(s.owner, {
        ...s.approved,
        pages: [{ ...s.approved.pages[0], expectedRevisionId: randomUUID() }],
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(
      (await s.forms.detail(s.owner, s.form.id)).publishedVersionId,
    ).toBeNull();
    await expect(s.media.read(null, s.asset.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
    await expect(
      s.website.publish(s.owner, {
        ...s.approved,
        pages: [
          ...s.approved.pages,
          { id: randomUUID(), expectedRevisionId: randomUUID() },
        ],
      }),
    ).rejects.toMatchObject({ code: "WEBSITE_REVIEW_INCOMPLETE" });
    await s.forms.save(s.owner, s.form.id, {
      expectedRevision: s.form.draftRevision,
      definition: { ...s.form.draft, title: "Changed form" },
    });
    await expect(s.website.publish(s.owner, s.approved)).rejects.toMatchObject({
      code: "FORM_REVISION_CONFLICT",
    });
    const current = await s.forms.detail(s.owner, s.form.id);
    await s.media.update(s.owner, {
      id: s.asset.id,
      title: "Changed image",
      visibility: "private",
    });
    await expect(
      s.website.publish(s.owner, {
        ...s.approved,
        forms: [
          {
            id: current.id,
            expectedRevision: current.draftRevision,
            confirmed: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "MEDIA_METADATA_CHANGED" });
    expect(
      (await s.forms.detail(s.owner, s.form.id)).publishedVersionId,
    ).toBeNull();
    await expect(s.media.read(null, s.asset.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
  });

  it("C03 website form review withholds questions while Forms is disabled and publication rechecks availability", async () => {
    const s = await dependencies();
    const scope = await s.authorization.require(s.owner, "cms.publish");
    await s.db.insert(clubFeature).values({
      organizationId: scope.organizationId,
      key: "forms",
      enabled: false,
      version: 1,
      lastDisabledAt: new Date(),
    });
    const review = await s.website.reviewPublication(s.owner, "en", "website");
    expect(review.forms[0]).toMatchObject({
      title: "Referenced form",
      definition: null,
      expectedRevision: null,
      canPublish: false,
    });
    await expect(s.website.publish(s.owner, s.approved)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(s.media.read(null, s.asset.id)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
    });
  });

  it("C03 existing public form questions stay published until their new draft is individually approved", async () => {
    const s = await dependencies();
    await s.website.publish(s.owner, s.approved);
    const saved = await s.forms.save(s.owner, s.form.id, {
      expectedRevision: s.form.draftRevision,
      definition: { ...s.form.draft, title: "Optional updated questions" },
    });
    const review = await s.website.reviewPublication(s.owner, "en", "website");
    expect(review.forms[0]).toMatchObject({
      status: "changes",
      expectedRevision: saved.draftRevision,
      publishedVersionNumber: s.form.draftRevision,
    });
    await s.website.publish(s.owner, command(review));
    expect(
      (await s.forms.detail(s.owner, s.form.id)).publishedVersionNumber,
    ).toBe(s.form.draftRevision);
    const latest = await s.website.reviewPublication(s.owner, "en", "website");
    await s.website.publish(s.owner, {
      ...command(latest),
      forms: [
        {
          id: saved.id,
          expectedRevision: saved.draftRevision,
          confirmed: true,
        },
      ],
    });
    expect(
      (await s.forms.detail(s.owner, s.form.id)).publishedVersionNumber,
    ).toBe(saved.draftRevision);
  });

  it("C03 website review reports every unpublished linked album and directory profile before the final action", async () => {
    const s = await setup();
    const albums = new AlbumService(s.db, s.authorization, s.media);
    const album = await albums.create(s.owner, {
      title: "Reviewed album",
      items: [],
    });
    const partners = new PartnerService(
      s.db,
      s.authorization,
      s.media,
      new CmsPartnerUsage(),
    );
    const profile = await partners.create(s.owner, {
      name: "Reviewed profile",
      description: "Synthetic",
      category: "partner",
      website: "",
      logoId: null,
    });
    await s.cms.save(s.owner, {
      id: s.page.id,
      locale: "en",
      expectedRevisionId: s.page.draft.id,
      title: s.page.draft.title,
      slug: s.page.draft.slug,
      description: "",
      socialImageId: null,
      data: {
        root: { props: {} },
        content: [
          {
            type: "Gallery",
            props: { id: "album", version: 1, albumId: album.id, items: [] },
          },
          {
            type: "PartnerCollection",
            props: {
              id: "profile",
              version: 1,
              title: "Partners",
              partnerIds: [profile.id],
              presentation: "cards",
            },
          },
        ],
      },
    });
    const review = await s.website.reviewPublication(s.owner, "en", "website");
    expect(review.problems).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("Reviewed album"),
        href: `/admin/media/albums?album=${album.id}`,
      }),
      expect.objectContaining({
        message: expect.stringContaining("Reviewed profile"),
        href: "/admin/partners?search=Reviewed%20profile",
      }),
    ]);
    expect(
      (await albums.get(s.owner, album.id)).publishedRevisionId,
    ).toBeNull();
    expect((await partners.query(s.owner, {})).items[0].published).toBeNull();
  });

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
    await s.db.insert(membership).values({
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
