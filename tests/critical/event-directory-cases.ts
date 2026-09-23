import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { FeatureService } from "../../src/core/features/FeatureService";
import type { Database } from "../../src/infrastructure/database/client";
import type {
  AuthorizationService,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { CmsService } from "../../src/features/cms/CmsService";
import type { MediaService } from "../../src/features/media/MediaService";
import { EventDirectoryService } from "../../src/features/events/EventDirectoryService";
import { defaultEventDirectoryDesign } from "../../src/features/events/event_directory";

type Context = {
  db: Database;
  cms: CmsService;
  media: MediaService;
  authorization: AuthorizationService;
  actor: (name: string) => Promise<TrustedActor>;
  installedClub: () => Promise<{ owner: TrustedActor }>;
};

export function eventDirectoryChecks(get: () => Context) {
  it("C03 directory design isolates draft/publication, website settings, locales and concurrent writes", async () => {
    const { db, cms, media, authorization, installedClub } = get();
    const { owner } = await installedClub();
    const service = new EventDirectoryService(db, authorization, media);
    let site = await cms.getSite(owner, "en");
    site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: { ...site.draft, footerText: "Published footer" },
    });
    site = await cms.publishSite(owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    site = await cms.saveSite(owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: { ...site.draft, footerText: "Private footer draft" },
    });
    const baseline = await cms.publicSite("en");
    const initial = await service.workspace(owner, "en");
    expect(initial.version).toBe(0);
    expect(await service.publicDesign("en")).toBeNull();
    const design = {
      ...defaultEventDirectoryDesign,
      title: "Our community calendar",
      layout: "list",
    };
    const draft = await service.save(owner, {
      locale: "en",
      expectedVersion: 0,
      design,
    });
    expect(await service.publicDesign("en")).toBeNull();
    await expect(
      service.save(owner, { locale: "en", expectedVersion: 0, design }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(
      service.publish(owner, { locale: "en", expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const published = await service.publish(owner, {
      locale: "en",
      expectedVersion: draft.version,
    });
    expect(await service.publicDesign("en")).toEqual(design);
    expect(await service.publicDesign("fr")).toBeNull();
    expect(await cms.getSite(owner, "en")).toEqual(site);
    expect(await cms.publicSite("en")).toEqual(baseline);
    await service.save(owner, {
      locale: "en",
      expectedVersion: published.version,
      design: { ...design, title: "Private new title" },
    });
    expect((await service.publicDesign("en"))?.title).toBe(design.title);
    await cms.publishSite(owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    expect((await service.publicDesign("en"))?.title).toBe(design.title);
  });

  it("C03 directory authoring enforces current club permissions, feature state and image privacy", async () => {
    const { db, media, authorization, actor, installedClub } = get();
    const { owner } = await installedClub();
    const { organizationId } = await authorization.require(owner, "cms.edit");
    const member = await actor("directory-member");
    await db.insert(membership).values({
      organizationId,
      userId: member.userId,
      role: "member",
      status: "approved",
    });
    const service = new EventDirectoryService(db, authorization, media);
    for (const operation of [
      () => service.workspace(member, "en"),
      () =>
        service.save(member, {
          locale: "en",
          expectedVersion: 0,
          design: defaultEventDirectoryDesign,
        }),
      () => service.publish(member, { locale: "en", expectedVersion: 0 }),
    ]) {
      await expect(operation()).rejects.toMatchObject({ status: 403 });
    }
    const image = await media.upload(owner, {
      filename: "directory-private.png",
      bytes: await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#446655" },
      })
        .png()
        .toBuffer(),
    });
    await expect(
      service.save(owner, {
        locale: "en",
        expectedVersion: 0,
        design: { ...defaultEventDirectoryDesign, coverImageId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "MEDIA_SCOPE_INVALID" });
    const draft = await service.save(owner, {
      locale: "en",
      expectedVersion: 0,
      design: { ...defaultEventDirectoryDesign, coverImageId: image.id },
    });
    await expect(
      service.publish(owner, { locale: "en", expectedVersion: draft.version }),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    expect(await service.publicDesign("en")).toBeNull();
    await expect(media.delete(owner, image.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    await media.update(owner, { id: image.id, visibility: "public" });
    const published = await service.publish(owner, {
      locale: "en",
      expectedVersion: draft.version,
    });
    await expect(
      media.update(owner, { id: image.id, visibility: "private" }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    await new FeatureService(db, authorization).configure(owner, {
      key: "events",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    expect(await service.publicDesign("en")).toBeNull();
    await expect(
      service.save(owner, {
        locale: "en",
        expectedVersion: published.version,
        design: defaultEventDirectoryDesign,
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(
      service.publish(owner, {
        locale: "en",
        expectedVersion: published.version,
      }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });
}
