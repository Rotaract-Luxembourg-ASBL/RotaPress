import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { CmsService } from "../../src/features/cms/CmsService";
import { CmsPreviewService } from "../../src/features/cms/CmsPreviewService";
import type { CmsData, CmsDetail } from "../../src/features/cms/cms_schemas";
import { FormService } from "../../src/features/forms/FormService";
import { MediaService } from "../../src/features/media/MediaService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import type { eventWebsiteChecks } from "./event-website-cases";

const version = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const save = (page: CmsDetail, data = page.draft.data) => ({
  ...version(page),
  title: page.draft.title,
  slug: page.draft.slug,
  description: page.draft.description,
  socialImageId: page.draft.socialImageId,
  data,
});

export function eventPrivateMediaChecks(
  get: Parameters<typeof eventWebsiteChecks>[0],
) {
  async function setup() {
    const { db, authorization, events, club } = get();
    const people = await club();
    // Real PostgreSQL authority and references; only file storage is an in-memory fixture.
    const files = new Map<string, Buffer>();
    const media = new MediaService(db, authorization, {
      async write(bytes) {
        const key = randomUUID();
        files.set(key, bytes);
        return key;
      },
      async read(key) {
        const value = files.get(key);
        if (!value) throw new Error("Fixture image absent");
        return value;
      },
      async delete(key) {
        files.delete(key);
      },
    });
    const modules = new EventModuleService(db, events);
    const cms = new CmsService(
      db,
      authorization,
      media,
      new FormService(db, authorization),
      events,
      modules,
    );
    const previews = new CmsPreviewService(db, cms, events, media);
    let event = await events.create(people.owner, {
      title: "Synthetic private artwork event",
      description: "Local security fixture",
      startsAt: "2030-06-12T14:00:00Z",
      endsAt: null,
      timezone: "Europe/Luxembourg",
      venue: "Synthetic room",
      visibility: "public",
      managerUserId: people.manager.userId,
    });
    event = await modules.change(people.manager, {
      id: event.id,
      expectedVersion: event.version,
      key: "website",
      operation: "enable",
      confirmed: true,
    });
    const page = await cms.create(people.manager, {
      kind: "page",
      locale: "en",
      title: "Event artwork",
      slug: "event-artwork",
      event: { id: event.id, moduleKey: "website" },
    });
    const asset = await media.upload(people.owner, {
      filename: "synthetic-private-event-artwork.png",
      title: "Synthetic private event artwork",
      alt: "Synthetic green square",
      bytes: await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#246a34" },
      })
        .png()
        .toBuffer(),
    });
    const data: CmsData = {
      root: { props: {} },
      content: [
        {
          type: "Image",
          props: {
            id: "private-event-image",
            version: 1,
            assetId: asset.id,
            alt: asset.alt,
            caption: "Synthetic fixture",
          },
        },
      ],
    };
    return { ...people, db, cms, media, previews, page, asset, data };
  }

  describe("C06 private draft images", () => {
    it("lets club media managers save and preview private event artwork without publishing its bytes", async () => {
      const s = await setup();
      let page = await s.cms.save(s.owner, {
        ...save(s.page, s.data),
        socialImageId: s.asset.id,
      });
      expect(page.publishedRevisionId).toBeNull();
      expect(
        (await s.cms.preview(s.owner, page.id, "en")).data.content,
      ).toEqual(s.data.content);
      const preview = await s.previews.create(s.owner, save(page));
      expect(preview.url).toContain("snapshot=");
      expect((await s.media.read(s.owner, s.asset.id)).visibility).toBe(
        "private",
      );
      await expect(s.media.read(s.manager, s.asset.id)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(s.media.read(null, s.asset.id)).rejects.toMatchObject({
        status: 404,
      });
      for (const actor of [s.owner, s.manager])
        await expect(s.cms.publish(actor, version(page))).rejects.toMatchObject(
          { code: "MEDIA_NOT_PUBLIC" },
        );
      expect(
        (await s.cms.detail(s.owner, page.id, "en")).publishedRevisionId,
      ).toBeNull();
      expect((await s.media.usage(s.owner, s.asset.id)).asset.visibility).toBe(
        "private",
      );
      await expect(s.cms.publicPage("en", page.draft.slug)).resolves.toBeNull();
      // Publication only succeeds after this separate, explicit human visibility change.
      await s.media.update(s.owner, { id: s.asset.id, visibility: "public" });
      page = await s.cms.publish(s.manager, version(page));
      expect(page.publishedRevisionId).toBe(page.draft.id);
      expect((await s.media.read(null, s.asset.id)).visibility).toBe("public");
    });

    it("keeps event-only editors public-only and reevaluates media authority after role changes", async () => {
      const s = await setup();
      const input = save(s.page, s.data);
      await expect(s.cms.save(s.manager, input)).rejects.toMatchObject({
        code: "MEDIA_NOT_PUBLIC",
      });
      await expect(s.previews.create(s.manager, input)).rejects.toMatchObject({
        code: "MEDIA_NOT_PUBLIC",
      });
      expect((await s.cms.detail(s.manager, s.page.id, "en")).draft.id).toBe(
        s.page.draft.id,
      );
      await s.db
        .update(membership)
        .set({ role: "editor" })
        .where(eq(membership.userId, s.manager.userId));
      const page = await s.cms.save(s.manager, input);
      expect(page.draft.id).not.toBe(s.page.draft.id);
      await s.db
        .update(membership)
        .set({ role: "member" })
        .where(eq(membership.userId, s.manager.userId));
      await expect(s.cms.save(s.manager, save(page))).rejects.toMatchObject({
        code: "MEDIA_NOT_PUBLIC",
      });
      await expect(
        s.previews.create(s.manager, save(page)),
      ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
      await expect(s.media.read(s.manager, s.asset.id)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      expect((await s.cms.detail(s.manager, page.id, "en")).draft.id).toBe(
        page.draft.id,
      );
    });
  });
}
