import { expect, it } from "vitest";
import sharp from "sharp";
import type { CmsService } from "../../src/features/cms";
import type { MediaService } from "../../src/features/media";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import {
  validateContent,
  contentAssets,
} from "../../src/features/cms/cms_validation";
import { communityContent } from "../fixtures/community-content";
import { copyPageTemplate } from "../../src/features/cms/page_templates";

export function sectionChecks(
  get: () => {
    cms: CmsService;
    media: MediaService;
    installedClub: () => Promise<{ owner: TrustedActor }>;
  },
) {
  it("C03 keeps rich section images private, rejects executable content and preserves published copies", async () => {
    const { cms, media, installedClub } = get();
    const { owner } = await installedClub();
    const asset = await media.upload(owner, {
      filename: "synthetic-sections.png",
      title: "Synthetic section fixture",
      bytes: await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#25636b" },
      })
        .png()
        .toBuffer(),
    });
    let page = await cms.create(owner, {
      kind: "page",
      title: "Section safety",
      slug: "sections",
      locale: "en",
    });
    const content = communityContent(asset.id);
    const save = (data: unknown) =>
      cms.save(owner, {
        id: page.id,
        locale: "en",
        expectedRevisionId: page.draft.id,
        title: page.draft.title,
        slug: page.draft.slug,
        description: "",
        socialImageId: null,
        data,
      });
    const action = () => ({
      id: page.id,
      locale: "en",
      expectedRevisionId: page.draft.id,
    });
    // Each newly introduced media path must participate in the same publication gate.
    const cards = {
      type: "Cards" as const,
      props: {
        id: "image-card",
        version: 1 as const,
        items: [{ title: "Image card", text: "", href: "", assetId: asset.id }],
      },
    };
    for (const block of [
      ...content.content.filter((item) =>
        ["HeroSlider", "FeatureSection"].includes(item.type),
      ),
      cards,
    ]) {
      const data = { root: { props: {} }, content: [block] };
      expect(contentAssets(data)).toEqual([asset.id]);
      page = await save(data);
      await expect(cms.publish(owner, action())).rejects.toMatchObject({
        code: "MEDIA_NOT_PUBLIC",
      });
      expect(await cms.publicPage("en", "sections")).toBeNull();
    }
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,bad",
      "//external.test",
      "https://user:secret@example.test",
    ]) {
      const unsafe = structuredClone(content);
      const hero = unsafe.content.find((item) => item.type === "HeroSlider")!;
      hero.props.items[0].buttonHref = href;
      await expect(save(unsafe)).rejects.toThrow();
    }
    expect(() =>
      validateContent(
        {
          ...content,
          content: [
            {
              type: "Programme",
              props: {
                id: "bad",
                version: 1,
                title: "",
                introduction: "",
                items: [],
                script: "bad()",
              },
            },
          ],
        },
        "page",
      ),
    ).toThrow();
    expect(() => validateContent(content, "header")).toThrow();
    const metadata = {
      id: asset.id,
      title: asset.title,
      alt: asset.alt,
      caption: asset.caption,
      tags: asset.tags,
      collection: asset.collection,
    };
    await media.update(owner, { ...metadata, visibility: "public" });
    page = await save(content);
    page = await cms.publish(owner, action());
    const published = await cms.publicPage("en", "sections");
    expect(published?.data).toEqual(content);
    page = await save(copyPageTemplate("community"));
    expect(await cms.publicPage("en", "sections")).toEqual(published);
    expect((await cms.preview(owner, page.id, "en")).data).toEqual(
      page.draft.data,
    );
    await expect(
      media.update(owner, { ...metadata, visibility: "private" }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
  });

  it("C03 publishes the shared Events menu reference explicitly and preserves it through appearance changes", async () => {
    const { cms, installedClub } = get();
    const { owner } = await installedClub();
    let site = await cms.getSite(owner, "fr");
    site = await cms.saveSite(owner, {
      locale: "fr",
      expectedVersion: site.version,
      settings: {
        ...site.draft,
        navigation: [{ systemPage: "events", label: "Agenda" }],
      },
    });
    expect((await cms.publicSite("fr")).navigation).toEqual([]);
    site = await cms.publishSite(owner, {
      locale: "fr",
      expectedVersion: site.version,
    });
    const expected = [{ label: "Agenda", href: "/events?locale=fr" }];
    expect((await cms.publicSite("fr")).navigation).toEqual(expected);
    site = await cms.saveSite(owner, {
      locale: "fr",
      expectedVersion: site.version,
      settings: { ...site.draft, themeId: "minimal" },
    });
    await cms.activateAppearance(owner, {
      locale: "fr",
      expectedVersion: site.version,
    });
    expect((await cms.publicSite("fr")).navigation).toEqual(expected);
    await expect(
      cms.saveSite(owner, {
        locale: "fr",
        expectedVersion: site.version,
        settings: {
          ...site.draft,
          navigation: [{ systemPage: "admin", label: "Bad target" }],
        },
      }),
    ).rejects.toThrow();
  });
}
