import { expect, it } from "vitest";
import { clubFeature } from "../../db/schema/features";
import sharp from "sharp";
import {
  cmsContent,
  cmsRevision,
  cmsSite,
  cmsVariant,
} from "../../db/schema/cms";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import type { MediaService } from "../../src/features/media/MediaService";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import { FormService } from "../../src/features/forms/FormService";
import { CmsKitService } from "../../src/features/cms/kits/CmsKitService";
import { WebsiteSetupService } from "../../src/features/cms/WebsiteSetupService";
import type { WebsiteWorkspace } from "../../src/features/cms/website_setup_schemas";
import { kits } from "../../src/features/cms/kits/catalogue";
import {
  contentAssets,
  validateContent,
} from "../../src/features/cms/cms_validation";
import {
  cmsImageSource,
  defaultTemplateImages,
} from "../../src/features/cms/kits/template_images";

const websiteTemplateRecipes = kits["rotaract-action"].websiteRecipes;

type Context = {
  db: Database;
  cms: CmsService;
  media: MediaService;
  authorization: AuthorizationService;
  installedClub: () => Promise<{ owner: TrustedActor }>;
  actor: (name: string) => Promise<TrustedActor>;
};
const revision = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const save = (
  page: CmsDetail,
  changes: Partial<Omit<CmsDetail["draft"], "id" | "createdAt">>,
) => ({
  ...revision(page),
  title: page.draft.title,
  slug: page.draft.slug,
  description: page.draft.description,
  socialImageId: page.draft.socialImageId,
  data: page.draft.data,
  ...changes,
});
const publication = (workspace: WebsiteWorkspace) => ({
  locale: "en",
  expectedVersion: workspace.site.version,
  confirmed: true,
  pages: workspace.contents
    .filter(
      (item) =>
        !item.archived && workspace.selection?.contentIds.includes(item.id),
    )
    .map((item) => ({ id: item.id, expectedRevisionId: item.draftRevisionId })),
});

export function websiteChecks(get: () => Context) {
  const setup = async () => {
    const context = get();
    const { owner } = await context.installedClub();
    const forms = new FormService(context.db, context.authorization);
    const kits = new CmsKitService(
      context.db,
      context.authorization,
      context.media,
      context.cms,
      forms,
      true,
    );
    return {
      ...context,
      owner,
      forms,
      kits,
      website: new WebsiteSetupService(
        context.db,
        context.authorization,
        context.media,
        context.cms,
        kits,
      ),
    };
  };

  it("C03 updated defaults honor Calendar availability and keep older installed copies reusable", async () => {
    const s = await setup();
    let workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotary-service",
      locale: "en",
      expectedVersion: 0,
      confirmed: true,
    });
    const recipes =
      workspace.site.draft.templateSetup!.installations[0].recipes;
    const calendarId = recipes.find((item) => item.recipe === "calendar")!.id;
    const calendar = await s.cms.detail(s.owner, calendarId, "en");
    expect(calendar.draft.data.content).toContainEqual(
      expect.objectContaining({
        type: "Calendar",
        props: expect.objectContaining({
          calendarIds: [],
          timezone: "Europe/Luxembourg",
        }),
      }),
    );
    // Model a pre-refresh installation using its stable saved IDs, without the new recipes.
    const legacyRecipes = recipes.filter(
      (item) => !["calendar", "team"].includes(item.recipe),
    );
    const oldHome = await s.cms.detail(
      s.owner,
      workspace.site.draft.homePageId!,
      "en",
    );
    const legacy = await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: workspace.site.version,
      settings: {
        ...workspace.site.draft,
        navigation: workspace.site.draft.navigation.filter(
          (item) => !("pageId" in item) || item.pageId !== calendarId,
        ),
        templateSetup: {
          selectedKitId: "rotary-service",
          installations: [{ kitId: "rotary-service", recipes: legacyRecipes }],
        },
      },
    });
    const { organizationId } = await s.authorization.require(
      s.owner,
      "cms.edit",
    );
    await s.db
      .insert(clubFeature)
      .values({
        organizationId,
        key: "calendar",
        enabled: false,
        version: 1,
        lastDisabledAt: new Date(),
      });
    workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
      expectedVersion: legacy.version,
      confirmed: true,
    });
    const second = workspace.site.draft.templateSetup!.installations.find(
      (item) => item.kitId === "rotaract-action",
    )!;
    for (const item of second.recipes) {
      const page = await s.cms.detail(s.owner, item.id, "en");
      expect(
        page.draft.data.content.some((block) => block.type === "Calendar"),
      ).toBe(false);
    }
    expect(
      await s.authorization.features.enabled(organizationId, "calendar"),
    ).toBe(false);
    workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotary-service",
      locale: "en",
      expectedVersion: workspace.site.version,
      confirmed: true,
    });
    expect(
      workspace.site.draft.templateSetup!.installations[0].recipes,
    ).toEqual(legacyRecipes);
    expect((await s.cms.detail(s.owner, oldHome.id, "en")).draft).toEqual(
      oldHome.draft,
    );
    expect(workspace.site.published).toBeNull();
  });

  it("C03 keeps Events routing and SEO behind publication and rejects private sharing media", async () => {
    const s = await setup();
    let page = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Our events",
      slug: "our-events",
    });
    const initial = await s.cms.getSite(s.owner, "en");
    const seo = {
      title: "Our club",
      description: "Published club summary",
      socialImageId: null,
      indexable: false,
      googleVerification: "synthetic-verification",
    };
    let site = await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: initial.version,
      settings: { ...initial.draft, eventsPageId: page.id, seo },
    });
    expect((await s.cms.publicSite("en")).seo).toBeUndefined();
    expect(await s.cms.publicEventsPage("en")).toEqual({
      configured: false,
      page: null,
    });
    await expect(
      s.cms.publishSite(s.owner, {
        locale: "en",
        expectedVersion: site.version,
      }),
    ).rejects.toMatchObject({ code: "EVENTS_PAGE_NOT_PUBLISHED" });
    page = await s.cms.publish(s.owner, revision(page));
    site = await s.cms.publishSite(s.owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    expect((await s.cms.publicSite("en")).seo).toEqual(seo);
    expect((await s.cms.publicEventsPage("en")).page?.id).toBe(page.id);
    const image = await s.media.upload(s.owner, {
      filename: "private-social.png",
      bytes: await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#114488" },
      })
        .png()
        .toBuffer(),
    });
    site = await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: {
        ...site.draft,
        eventsPageId: null,
        seo: { ...seo, socialImageId: image.id },
      },
    });
    await expect(
      s.cms.publishSite(s.owner, {
        locale: "en",
        expectedVersion: site.version,
      }),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    expect((await s.cms.publicEventsPage("en")).page?.id).toBe(page.id);
    await s.cms.unpublish(s.owner, revision(page));
    expect(await s.cms.publicEventsPage("en")).toEqual({
      configured: true,
      page: null,
    });
  });

  it("C03 website setup installs a coherent private template and preserves renamed copies and existing work", async () => {
    const s = await setup();
    const original = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Existing homepage",
      slug: "home",
    });
    await s.cms.publish(s.owner, revision(original));
    const about = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Existing about page",
      slug: "about",
    });
    await s.cms.publish(s.owner, revision(about));
    const renamedAbout = await s.cms.save(
      s.owner,
      save(about, { slug: "about-2" }),
    );
    const archivedAbout = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Archived about page",
      slug: "about-3",
    });
    await s.cms.archive(s.owner, revision(archivedAbout));
    const existingIds = [original.id, about.id, archivedAbout.id];
    const liveBefore = await s.cms.publicHome("en");
    let workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
      expectedVersion: 0,
      confirmed: true,
    });
    expect(workspace.selection?.contentIds).toHaveLength(
      websiteTemplateRecipes.length,
    );
    expect(workspace.site.draft).toMatchObject({
      themeId: "rotaract-action",
      homePageId: expect.any(String),
      headerId: expect.any(String),
      footerId: expect.any(String),
    });
    expect(workspace.site.draft.navigation.map((item) => item.label)).toEqual([
      "Home",
      "About",
      "Projects",
      "Events",
      "Calendar",
      "Join",
      "Contact",
    ]);
    expect(workspace.site.published).toBeNull();
    const contactForm = await s.forms.detail(
      s.owner,
      workspace.site.draft.contactFormId!,
    );
    expect(contactForm.kind).toBe("contact");
    expect(contactForm.publishedVersionId).toBeNull();
    const initialRecipes =
      workspace.site.draft.templateSetup!.installations[0].recipes;
    const installedSlug = (recipe: string) =>
      workspace.contents.find(
        (item) =>
          item.id === initialRecipes.find((item) => item.recipe === recipe)?.id,
      )?.slug;
    expect(installedSlug("home")).toBe("home-2");
    expect(installedSlug("about")).toBe("about-4");
    expect(installedSlug("projects")).toBe("projects");
    expect((await s.cms.publicPage("en", "about"))?.id).toBe(about.id);
    expect(
      workspace.contents.find(
        (item) => item.id === workspace.site.draft.homePageId,
      )?.title,
    ).toBe("Home");
    expect(await s.cms.publicHome("en")).toEqual(liveBefore);
    expect(
      workspace.contents
        .filter((item) => !existingIds.includes(item.id))
        .every(
          (item) =>
            item.publishedRevisionId === null &&
            item.kitId === "rotaract-action" &&
            item.demonstration === false,
        ),
    ).toBe(true);
    const home = await s.cms.detail(
      s.owner,
      workspace.site.draft.homePageId!,
      "en",
    );
    expect(JSON.stringify(home.draft.data)).toContain("template:garden");
    const edited = await s.cms.save(
      s.owner,
      save(home, { title: "Our edited home", slug: "our-own-home" }),
    );
    const savedSite = await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: workspace.site.version,
      settings: {
        ...workspace.site.draft,
        footerText: "Our footer",
        accentColor: "#123456",
        font: "serif",
        branding: {
          ...workspace.site.draft.branding,
          mark: "none",
          showName: false,
        },
      },
    });
    workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
      expectedVersion: savedSite.version,
      confirmed: true,
    });
    expect(workspace.site).toEqual(savedSite);
    expect(workspace.contents).toHaveLength(
      websiteTemplateRecipes.length + existingIds.length,
    );
    expect((await s.cms.detail(s.owner, home.id, "en")).draft).toEqual(
      edited.draft,
    );
    workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotary-service",
      locale: "en",
      expectedVersion: workspace.site.version,
      confirmed: true,
    });
    const secondAboutId = workspace.site.draft
      .templateSetup!.installations.find(
        (item) => item.kitId === "rotary-service",
      )!
      .recipes.find((item) => item.recipe === "about")!.id;
    expect(
      workspace.contents.find((item) => item.id === secondAboutId)?.slug,
    ).toBe("about-5");
    workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
      expectedVersion: workspace.site.version,
      confirmed: true,
    });
    expect(workspace.site.draft.homePageId).toBe(home.id);
    expect(workspace.site.draft).toMatchObject({
      accentColor: "#123456",
      font: "serif",
      branding: savedSite.draft.branding,
    });
    const brandingPreview = await s.website.preview(s.owner, { locale: "en" });
    expect(brandingPreview.site.branding).toEqual(savedSite.draft.branding);
    const otherTemplate = await s.website.previewTemplate(s.owner, {
      kitId: "rotary-service",
      locale: "en",
    });
    expect(otherTemplate.site).toMatchObject({
      themeId: "rotary-service",
      accentColor: "#123456",
      font: "serif",
      branding: savedSite.draft.branding,
    });
    expect((await s.cms.detail(s.owner, home.id, "en")).draft).toEqual(
      edited.draft,
    );
    expect(workspace.contents).toHaveLength(
      websiteTemplateRecipes.length * 2 + existingIds.length,
    );
    expect((await s.cms.detail(s.owner, original.id, "en")).draft).toEqual(
      original.draft,
    );
    expect((await s.cms.detail(s.owner, about.id, "en")).draft).toEqual(
      renamedAbout.draft,
    );
    expect((await s.cms.publicPage("en", "about"))?.id).toBe(about.id);
    expect(await s.cms.publicHome("en")).toEqual(liveBefore);
    const installation = workspace.site.draft.templateSetup!.installations.find(
      (item) => item.kitId === "rotaract-action",
    )!;
    const removedIds = installation.recipes
      .filter((item) => ["about", "gallery"].includes(item.recipe))
      .map((item) => item.id);
    for (const id of removedIds)
      await s.cms.archive(
        s.owner,
        revision(await s.cms.detail(s.owner, id, "en")),
      );
    workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotary-service",
      locale: "en",
      expectedVersion: workspace.site.version,
      confirmed: true,
    });
    workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
      expectedVersion: workspace.site.version,
      confirmed: true,
    });
    expect(
      workspace.selection?.contentIds.some((id) => removedIds.includes(id)),
    ).toBe(false);
    expect(
      workspace.site.draft.navigation.some(
        (item) => "pageId" in item && removedIds.includes(item.pageId),
      ),
    ).toBe(false);
    expect(
      workspace.site.draft.templateSetup!.installations.find(
        (item) => item.kitId === "rotaract-action",
      )!.recipes,
    ).toEqual(installation.recipes);
    expect(workspace.contents).toHaveLength(
      websiteTemplateRecipes.length * 2 + existingIds.length,
    );
    expect(workspace.site.draft.homePageId).toBe(home.id);
  });

  it("C03 website preview renders coherent template and draft settings without persisting examples or granting access", async () => {
    const s = await setup();
    const before = await s.db.select().from(cmsContent);
    const template = await s.website.previewTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
    });
    expect(template.site.themeId).toBe("rotaract-action");
    expect(template.site.header).not.toBeNull();
    expect(template.site.footer).not.toBeNull();
    expect(JSON.stringify(template.page.data)).toContain("template:garden");
    expect(template.cards.length).toBeGreaterThan(0);
    expect(
      template.site.navigation.every((item) =>
        item.href.startsWith("/admin/website/preview?template="),
      ),
    ).toBe(true);
    expect(await s.db.select().from(cmsContent)).toEqual(before);
    expect(await s.db.select().from(cmsRevision)).toHaveLength(0);
    expect(await s.db.select().from(cmsSite)).toHaveLength(0);
    const outsider = await s.actor("website-outsider");
    await expect(
      s.website.previewTemplate(outsider, {
        kitId: "rotaract-action",
        locale: "en",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      s.website.useTemplate(outsider, {
        kitId: "rotaract-action",
        locale: "en",
        expectedVersion: 0,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    const workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
      expectedVersion: 0,
      confirmed: true,
    });
    const preview = await s.website.preview(s.owner, { locale: "en" });
    expect(preview.page.id).toBe(workspace.site.draft.homePageId);
    expect(preview.site.header?.root.props.kit).toBe("rotaract-action");
    expect(preview.site.navigation).toHaveLength(7);
    expect(
      preview.site.navigation.every((item) =>
        item.href.startsWith("/admin/website/preview?locale=en&pageId="),
      ),
    ).toBe(true);
    expect(await s.cms.publicHome("en")).toEqual({
      configured: false,
      page: null,
    });
    await expect(
      s.website.preview(outsider, { locale: "en" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      s.website.publish(outsider, publication(workspace)),
    ).rejects.toMatchObject({ status: 403 });
    await s.kits.import(s.owner, {
      kitId: "rotary-service",
      locale: "en",
      namespace: "example-only",
      recipes: ["home"],
      demonstration: true,
      confirmed: true,
    });
    expect(
      (await s.cms.list(s.owner)).find(
        (item) => item.slug === "example-only-home",
      ),
    ).toMatchObject({ kitId: "rotary-service", demonstration: true });
  });

  it("C03 website publication checks reviewed revisions, settings and dependencies and commits all pointers atomically", async () => {
    const s = await setup();
    let workspace = await s.website.useTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
      expectedVersion: 0,
      confirmed: true,
    });
    const templateForm = await s.forms.detail(
      s.owner,
      workspace.site.draft.contactFormId!,
    );
    await expect(
      s.website.publish(s.owner, publication(workspace)),
    ).rejects.toMatchObject({ code: "FORM_NOT_PUBLISHED" });
    expect((await s.cms.publicEventsPage("en")).configured).toBe(false);
    await s.forms.publish(s.owner, templateForm.id, {
      expectedRevision: templateForm.draftRevision,
    });
    const review = publication(workspace);
    await expect(
      s.website.publish(s.owner, { ...review, pages: review.pages.slice(1) }),
    ).rejects.toMatchObject({ code: "WEBSITE_REVIEW_INCOMPLETE" });
    await expect(
      s.website.publish(s.owner, { ...review, expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const lastId = workspace.selection!.contentIds.at(-1)!;
    let last = await s.cms.detail(s.owner, lastId, "en");
    last = await s.cms.save(
      s.owner,
      save(last, { title: "Changed after review" }),
    );
    await expect(s.website.publish(s.owner, review)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    expect(
      (await s.db.select().from(cmsVariant)).every(
        (row) => row.publishedRevisionId === null,
      ),
    ).toBe(true);
    const form = await s.forms.create(s.owner, {
      kind: "contact",
      title: "Contact our club",
    });
    last = await s.cms.save(
      s.owner,
      save(last, {
        data: {
          ...last.draft.data,
          content: [
            ...last.draft.data.content,
            {
              type: "Form",
              props: { id: "contact-form", version: 1, formId: form.id },
            },
          ],
        },
      }),
    );
    workspace = await s.website.workspace(s.owner, "en");
    await expect(
      s.website.publish(s.owner, publication(workspace)),
    ).rejects.toMatchObject({ code: "FORM_NOT_PUBLISHED" });
    expect(
      (await s.db.select().from(cmsVariant)).every(
        (row) => row.publishedRevisionId === null,
      ),
    ).toBe(true);
    expect((await s.cms.getSite(s.owner, "en")).published).toBeNull();
    await s.forms.publish(s.owner, form.id, {
      expectedRevision: form.draftRevision,
    });
    const image = await s.media.upload(s.owner, {
      filename: "website-private.png",
      bytes: await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#114488" },
      })
        .png()
        .toBuffer(),
    });
    await s.cms.save(s.owner, save(last, { socialImageId: image.id }));
    workspace = await s.website.workspace(s.owner, "en");
    await expect(
      s.website.publish(s.owner, publication(workspace)),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    expect(
      (await s.db.select().from(cmsVariant)).every(
        (row) => row.publishedRevisionId === null,
      ),
    ).toBe(true);
    await s.media.update(s.owner, { id: image.id, visibility: "public" });
    const published = await s.website.publish(s.owner, publication(workspace));
    expect(published.site.published).toEqual(workspace.site.draft);
    expect(
      published.contents.every(
        (item) => item.publishedRevisionId === item.draftRevisionId,
      ),
    ).toBe(true);
    expect((await s.cms.publicHome("en")).page?.id).toBe(
      workspace.site.draft.homePageId,
    );
    const site = await s.cms.publicSite("en");
    expect(site.themeId).toBe("rotaract-action");
    expect(site.header?.root.props.kit).toBe("rotaract-action");
    expect(site.navigation).toHaveLength(7);
    expect(site.navigation.find((item) => item.label === "Events")?.href).toBe(
      "/events?locale=en",
    );
    expect((await s.cms.publicEventsPage("en")).page?.id).toBe(
      workspace.site.draft.eventsPageId,
    );
    const recipes =
      workspace.site.draft.templateSetup!.installations[0].recipes;
    const gallery = await s.cms.detail(
      s.owner,
      recipes.find((item) => item.recipe === "gallery")!.id,
      "en",
    );
    await s.cms.archive(s.owner, revision(gallery));
    workspace = await s.website.workspace(s.owner, "en");
    const repeated = await s.website.useTemplate(s.owner, {
      kitId: "rotaract-action",
      locale: "en",
      expectedVersion: workspace.site.version,
      confirmed: true,
    });
    expect(repeated.site).toEqual(workspace.site);
    await expect(
      s.website.publish(s.owner, publication(workspace)),
    ).resolves.toMatchObject({ site: { published: expect.any(Object) } });
    workspace = await s.website.workspace(s.owner, "en");
    await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: workspace.site.version,
      settings: {
        ...workspace.site.draft,
        navigation: [
          ...workspace.site.draft.navigation,
          { pageId: last.id, label: "Partners" },
        ],
      },
    });
    await s.cms.archive(
      s.owner,
      revision(await s.cms.detail(s.owner, last.id, "en")),
    );
    workspace = await s.website.workspace(s.owner, "en");
    await expect(
      s.website.publish(s.owner, publication(workspace)),
    ).rejects.toMatchObject({ code: "WEBSITE_REVIEW_INCOMPLETE" });
  });

  it("C04 website template images accept only bundled references and preserve uploaded-media publication gates", async () => {
    const s = await setup();
    const page = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Template image boundary",
      slug: "template-image-boundary",
    });
    const imageData = (assetId: string) => ({
      root: { props: {} },
      content: [
        {
          type: "Hero" as const,
          props: {
            id: "image-test",
            version: 1 as const,
            title: "Illustrative garden",
            body: "",
            buttonLabel: "",
            buttonHref: "",
            assetId,
          },
        },
      ],
    });
    for (const id of defaultTemplateImages) {
      expect(contentAssets(validateContent(imageData(id), "page"))).toEqual([]);
      expect(cmsImageSource(id)).toMatch(
        /^\/templates\/shared\/(garden|seedlings|herbs)\.jpg$/,
      );
    }
    for (const id of [
      "template:unknown",
      "template:../secret",
      "/templates/shared/garden.jpg",
      "https://example.test/image.jpg",
    ]) {
      await expect(
        s.cms.save(s.owner, save(page, { data: imageData(id) })),
      ).rejects.toThrow();
      expect(cmsImageSource(id)).toBeUndefined();
    }
    let saved = await s.cms.save(
      s.owner,
      save(page, { data: imageData("template:garden") }),
    );
    await s.cms.publish(s.owner, revision(saved));
    expect(
      (await s.cms.publicPage("en", saved.draft.slug))?.data.content[0],
    ).toMatchObject({ props: { assetId: "template:garden" } });
    const image = await s.media.upload(s.owner, {
      filename: "private-replacement.png",
      bytes: await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#114488" },
      })
        .png()
        .toBuffer(),
    });
    saved = await s.cms.save(
      s.owner,
      save(saved, { data: imageData(image.id) }),
    );
    expect(contentAssets(saved.draft.data)).toEqual([image.id]);
    expect(cmsImageSource(image.id)).toBe(`/media/${image.id}`);
    await expect(s.cms.publish(s.owner, revision(saved))).rejects.toMatchObject(
      { code: "MEDIA_NOT_PUBLIC" },
    );
    expect(
      (await s.cms.publicPage("en", saved.draft.slug))?.data.content[0],
    ).toMatchObject({ props: { assetId: "template:garden" } });
  });
}
