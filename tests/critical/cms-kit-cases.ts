import { expect, it } from "vitest";
import sharp from "sharp";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms";
import type { MediaService } from "../../src/features/media";
import { FormService } from "../../src/features/forms/FormService";
import { CmsKitService } from "../../src/features/cms/kits/CmsKitService";
import { kitRecipes } from "../../src/features/cms/kits/catalogue";
import {
  defaultSiteSettings,
  type CmsDetail,
} from "../../src/features/cms/cms_schemas";
import {
  contentForms,
  validateContent,
} from "../../src/features/cms/cms_validation";
import { copyKitRecipe } from "../../src/features/cms/kits/recipes";
import { block, document } from "../../src/features/cms/kits/recipe_helpers";

type Context = {
  db: Database;
  cms: CmsService;
  media: MediaService;
  authorization: AuthorizationService;
  installedClub: () => Promise<{ owner: TrustedActor }>;
  actor: (name: string) => Promise<TrustedActor>;
};
const action = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
export function kitChecks(get: () => Context) {
  const setup = async () => {
    const context = get();
    const { owner } = await context.installedClub();
    const forms = new FormService(context.db, context.authorization);
    return {
      ...context,
      owner,
      forms,
      kits: new CmsKitService(
        context.db,
        context.authorization,
        context.media,
        context.cms,
        forms,
        true,
      ),
    };
  };
  it("C03 kit import keeps collisions and edited copies, creates private parts and rolls back invalid batches", async () => {
    const { cms, owner, kits, actor } = await setup();
    const existing = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Keep my work",
      slug: "club-home",
    });
    await cms.publish(owner, action(existing));
    const before = await cms.detail(owner, existing.id, "en");
    const siteBefore = await cms.getSite(owner, "en");
    const input = {
      kitId: "rotary-service",
      locale: "en",
      namespace: "club",
      recipes: kitRecipes.map((item) => item.id),
      confirmed: true,
    };
    const imported = await kits.import(owner, input);
    expect(imported.kept).toBe(1);
    expect(imported.created).toBe(kitRecipes.length - 1);
    expect(await cms.detail(owner, existing.id, "en")).toEqual(before);
    expect(await cms.getSite(owner, "en")).toEqual(siteBefore);
    const about = await cms.detail(
      owner,
      imported.items.find((item) => item.recipe === "about")!.id,
      "en",
    );
    const edited = await cms.save(owner, {
      ...action(about),
      title: "Our own story",
      slug: about.draft.slug,
      description: about.draft.description,
      socialImageId: about.draft.socialImageId,
      data: about.draft.data,
    });
    expect((await kits.import(owner, input)).created).toBe(0);
    expect((await cms.detail(owner, about.id, "en")).draft.id).toBe(
      edited.draft.id,
    );
    expect(await cms.publicPage("en", "club-about")).toBeNull();
    const unauthorized = await actor("kit-outsider");
    await expect(
      kits.import(unauthorized, { ...input, namespace: "forbidden" }),
    ).rejects.toThrow();
    await expect(
      kits.preview(unauthorized, {
        kitId: "rotary-service",
        namespace: "club",
        recipe: "about",
        locale: "en",
      }),
    ).rejects.toThrow();
    const count = (await cms.list(owner)).length;
    await expect(
      kits.import(owner, {
        ...input,
        namespace: "invalid",
        assets: [crypto.randomUUID()],
      }),
    ).rejects.toThrow();
    expect((await cms.list(owner)).length).toBe(count);
  });
  it("C03 kit parts become shared only by explicit selection and retain private revisions across appearance changes", async () => {
    const { cms, owner, kits } = await setup();
    const home = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Our home",
      slug: "home",
    });
    await cms.publish(owner, action(home));
    const original = await cms.create(owner, {
      kind: "header",
      locale: "en",
      title: "Original header",
      slug: "original-header",
    });
    await cms.publish(owner, action(original));
    const before = await cms.publicSite("en");
    await kits.import(owner, {
      kitId: "rotary-service",
      namespace: "partial",
      locale: "en",
      recipes: ["home"],
      confirmed: true,
    });
    const partialPreview = await kits.preview(owner, {
      kitId: "rotary-service",
      namespace: "partial",
      locale: "en",
      recipe: "home",
    });
    expect(partialPreview.site.header).toEqual(before.header);
    expect(partialPreview.sharedParts).toEqual([]);
    const result = await kits.import(owner, {
      kitId: "rotaract-action",
      namespace: "alternative",
      locale: "en",
      recipes: ["header", "footer"],
      confirmed: true,
    });
    const header = await cms.detail(owner, result.items[0].id, "en");
    expect(header.affectedPages).toEqual([]);
    await cms.publish(owner, action(header));
    expect(await cms.publicSite("en")).toEqual(before);
    let site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: 0,
      settings: {
        ...defaultSiteSettings,
        themeId: "rotaract-action",
        headerId: header.id,
        navigation: [{ pageId: home.id, label: "Home" }],
      },
    });
    site = await cms.publishSite(owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    expect((await cms.publicSite("en")).header).toEqual(header.draft.data);
    const selected = await cms.detail(owner, header.id, "en");
    expect(selected.affectedPages.map((item) => item.id)).toEqual([home.id]);
    const changed = await cms.save(owner, {
      ...action(selected),
      title: selected.draft.title,
      slug: selected.draft.slug,
      description: "",
      socialImageId: null,
      data: document({ kit: "rotaract-action" }, [
        block("RichText", { text: "<p>Private shared change</p>" }),
      ]),
    });
    expect((await cms.publicSite("en")).header).toEqual(header.draft.data);
    const restored = await cms.restore(owner, {
      ...action(changed),
      revisionId: header.draft.id,
    });
    expect(restored.draft.id).not.toBe(header.draft.id);
    site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: { ...site.draft, themeId: "rotary-service" },
    });
    await cms.activateAppearance(owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    expect((await cms.publicSite("en")).header).toEqual(header.draft.data);
    expect((await cms.publicPage("en", "home"))?.id).toBe(home.id);
  });
  it("C04 kit media and nested forms stay protected and cards expose only published projections", async () => {
    const { cms, owner, media, kits, forms } = await setup();
    const image = await media.upload(owner, {
      filename: "private-kit.png",
      bytes: await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#0067c8" },
      })
        .png()
        .toBuffer(),
    });
    const imported = await kits.import(owner, {
      kitId: "rotary-service",
      namespace: "private",
      locale: "en",
      recipes: ["project-detail"],
      assets: [image.id],
      confirmed: true,
    });
    const page = await cms.detail(owner, imported.items[0].id, "en");
    await expect(cms.publish(owner, action(page))).rejects.toThrow();
    expect(await cms.publicPageCards("en")).toEqual([]);
    let contact = await forms.create(owner, {
      kind: "contact",
      title: "Contact the example club",
    });
    const data = copyKitRecipe("contact", {
      kit: "rotaract-action",
      contactFormId: contact.id,
    });
    expect(contentForms(data)).toEqual([contact.id]);
    let contactPage = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Contact",
      slug: "contact",
    });
    contactPage = await cms.save(owner, {
      ...action(contactPage),
      title: "Contact",
      slug: "contact",
      description: "Published summary",
      socialImageId: null,
      data,
    });
    await expect(cms.publish(owner, action(contactPage))).rejects.toThrow();
    contact = await forms.publish(owner, contact.id, {
      expectedRevision: contact.draftRevision,
    });
    expect(contact.publishedVersionId).toBeTruthy();
    await cms.publish(owner, action(contactPage));
    expect((await cms.publicPageCards("en")).map((item) => item.title)).toEqual(
      ["Contact"],
    );
    const changed = await cms.save(owner, {
      ...action(contactPage),
      title: "Private title",
      slug: "private-contact",
      description: "Private summary",
      socialImageId: null,
      data,
    });
    expect((await cms.publicPageCards("en"))[0]).toMatchObject({
      title: "Contact",
      description: "Published summary",
      href: "/pages/en/contact",
    });
    await cms.publish(owner, action(changed));
    expect((await cms.publicPageCards("en"))[0].href).toBe(
      "/pages/en/private-contact",
    );
    expect(() =>
      validateContent(
        document({ kit: "rotary-service" }, [
          block("Columns", {
            ratio: "balanced",
            left: [
              block("SiteBrand", {
                assetId: "",
                alt: "",
                label: "",
                logoSize: "medium",
                showName: true,
              }),
            ],
            right: [],
          }),
        ]),
        "page",
      ),
    ).toThrow();
  });
}
