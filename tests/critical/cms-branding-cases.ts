import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import sharp from "sharp";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import type { MediaService } from "../../src/features/media/MediaService";
import { defaultSiteSettings } from "../../src/features/cms/cms_schemas";
import { defaultWebsiteBranding } from "../../src/features/cms/website_branding";

type Context = {
  cms: CmsService;
  media: MediaService;
  actor: (name: string) => Promise<TrustedActor>;
  installedClub: () => Promise<{ owner: TrustedActor }>;
};

async function image(media: MediaService, owner: TrustedActor) {
  return media.upload(owner, {
    filename: "synthetic-club-brand.png",
    bytes: await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#25636b" },
    })
      .png()
      .toBuffer(),
  });
}

export function brandingChecks(get: () => Context) {
  it("C03 website branding stays private until reviewed publication and rejects inaccessible or private assets", async () => {
    const { cms, media, actor, installedClub } = get();
    const { owner } = await installedClub();
    const outsider = await actor("branding-outsider");
    const logo = await image(media, owner);
    const icon = await image(media, owner);
    const before = await cms.publicSite("en");
    const branding = {
      ...defaultWebsiteBranding,
      logoId: logo.id,
      iconId: icon.id,
      logoAlt: "Club signature",
    };
    let site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: 0,
      settings: { ...defaultSiteSettings, branding },
    });
    expect(await cms.publicSite("en")).toEqual(before);
    expect((await cms.previewSite(owner, "en")).branding).toEqual(branding);
    await expect(cms.previewSite(outsider, "en")).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      cms.saveSite(outsider, {
        locale: "en",
        expectedVersion: site.version,
        settings: { ...site.draft, branding: defaultWebsiteBranding },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      cms.publishSite(outsider, {
        locale: "en",
        expectedVersion: site.version,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      cms.saveSite(owner, {
        locale: "en",
        expectedVersion: site.version,
        settings: {
          ...site.draft,
          branding: { ...branding, logoId: randomUUID() },
        },
      }),
    ).rejects.toMatchObject({ code: "MEDIA_SCOPE_INVALID" });
    await expect(
      cms.saveSite(owner, {
        locale: "en",
        expectedVersion: site.version,
        settings: {
          ...site.draft,
          branding: { ...branding, iconId: "https://example.test/icon.png" },
        },
      }),
    ).rejects.toThrow();
    expect(await cms.getSite(owner, "en")).toEqual(site);
    await expect(media.delete(owner, logo.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    await media.update(owner, { id: logo.id, visibility: "public" });
    await expect(
      cms.publishSite(owner, {
        locale: "en",
        expectedVersion: site.version,
      }),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    expect(await cms.publicSite("en")).toEqual(before);
    expect(await media.usage(owner, logo.id)).toEqual({
      asset: { ...logo, visibility: "public" },
      savedReferences: 1,
      publishedReferences: 0,
    });
    await media.update(owner, { id: icon.id, visibility: "public" });
    site = await cms.publishSite(owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    expect((await cms.publicSite("en")).branding).toEqual(branding);
    for (const asset of [logo, icon]) {
      await expect(
        media.update(owner, { id: asset.id, visibility: "private" }),
      ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    }
    const replacement = await image(media, owner);
    site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: {
        ...site.draft,
        branding: { ...branding, logoId: replacement.id },
      },
    });
    expect((await cms.publicSite("en")).branding).toEqual(branding);
    expect((await cms.previewSite(owner, "en")).branding?.logoId).toBe(
      replacement.id,
    );
    // A legacy appearance-only activation must never publish a pending brand image.
    site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: { ...site.draft, themeId: "minimal" },
    });
    await cms.activateAppearance(owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    expect((await cms.publicSite("en")).branding).toEqual(branding);
    await expect(media.read(null, replacement.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("C04 website branding retains publication references per language until each language replaces them", async () => {
    const { cms, media, installedClub } = get();
    const { owner } = await installedClub();
    const logo = await image(media, owner);
    await media.update(owner, { id: logo.id, visibility: "public" });
    for (const locale of ["en", "fr"] as const) {
      const site = await cms.saveSite(owner, {
        locale,
        expectedVersion: 0,
        settings: {
          ...defaultSiteSettings,
          branding: {
            ...defaultWebsiteBranding,
            logoId: logo.id,
            iconId: logo.id,
          },
        },
      });
      await cms.publishSite(owner, { locale, expectedVersion: site.version });
    }
    expect(await media.usage(owner, logo.id)).toEqual({
      asset: { ...logo, visibility: "public" },
      savedReferences: 2,
      publishedReferences: 2,
    });
    for (const locale of ["en", "fr"] as const) {
      let site = await cms.getSite(owner, locale);
      site = await cms.saveSite(owner, {
        locale,
        expectedVersion: site.version,
        settings: { ...site.draft, branding: defaultWebsiteBranding },
      });
      // Removing an image from the draft does not release its live reference.
      await expect(
        media.update(owner, { id: logo.id, visibility: "private" }),
      ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
      await cms.publishSite(owner, { locale, expectedVersion: site.version });
      if (locale === "en") {
        expect((await cms.publicSite("fr")).branding?.logoId).toBe(logo.id);
        expect(await media.usage(owner, logo.id)).toEqual({
          asset: { ...logo, visibility: "public" },
          savedReferences: 1,
          publishedReferences: 1,
        });
      }
    }
    expect(await media.usage(owner, logo.id)).toEqual({
      asset: { ...logo, visibility: "public" },
      savedReferences: 0,
      publishedReferences: 0,
    });
    await media.update(owner, { id: logo.id, visibility: "private" });
    await media.delete(owner, logo.id);
  });
}
