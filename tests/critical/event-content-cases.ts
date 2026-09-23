import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
import { expect, it } from "vitest";
import { CmsService } from "../../src/features/cms/CmsService";
import { CmsPreviewService } from "../../src/features/cms/CmsPreviewService";
import {
  cmsDataSchema,
  type CmsData,
  type CmsDetail,
} from "../../src/features/cms/cms_schemas";
import { FormService } from "../../src/features/forms/FormService";
import { MediaService } from "../../src/features/media/MediaService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { visibleEventContent } from "../../src/features/events/event_design";
import { referenceEventPage } from "../../src/features/events/event_page_template";
import { eventPageNavigation } from "../../src/features/events/event_sections";
import { isSafeLink } from "../../src/core/safe-link";
import { eventLayouts } from "../../src/features/events/event_layouts";
import {
  eventLayoutRecipe,
  mergeEventLayout,
} from "../../src/features/events/event_layout_recipes";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import type { eventWebsiteChecks } from "./event-website-cases";

function content(assetId = ""): CmsData {
  return {
    root: { props: {} },
    content: [
      {
        type: "EventContact",
        props: {
          id: "event-contact",
          version: 1,
          title: "Contact the organizers",
          text: "Synthetic event enquiries",
          email: "event@example.test",
          phone: "+352 123 456",
          website: "https://example.test/contact",
        },
      },
      {
        type: "EventFlyer",
        props: {
          id: "event-flyer",
          version: 1,
          title: "Event flyer",
          assetId,
          alt: "Synthetic event flyer",
          caption: "Local test artwork",
        },
      },
      {
        type: "EventShare",
        props: { id: "event-share", version: 1, title: "Share this event" },
      },
    ],
  };
}
const version = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const save = (page: CmsDetail, data: unknown = page.draft.data) => ({
  ...version(page),
  title: page.draft.title,
  slug: page.draft.slug,
  description: page.draft.description,
  socialImageId: page.draft.socialImageId,
  data,
});

export function eventContentChecks(
  get: Parameters<typeof eventWebsiteChecks>[0],
) {
  async function setup() {
    const { db, authorization, events, club } = get();
    const people = await club();
    const modules = new EventModuleService(db, events);
    const media = new MediaService(
      db,
      authorization,
      new LocalStorageDriver(resolve(".local/test-uploads")),
    );
    const cms = new CmsService(
      db,
      authorization,
      media,
      new FormService(db, authorization),
      events,
      modules,
    );
    const website = new EventWebsiteService(
      db,
      authorization,
      events,
      modules,
      cms,
    );
    let event = await events.create(people.owner, {
      title: "Synthetic event content",
      description: "Event content boundaries",
      startsAt: "2030-06-12T14:00:00Z",
      endsAt: null,
      timezone: "Europe/Luxembourg",
      venue: "Example community room",
      visibility: "public",
      managerUserId: people.manager.userId,
    });
    async function change(
      key: "website" | "gallery" | "sponsors",
      operation: "enable" | "disable",
    ) {
      event = await modules.change(people.manager, {
        id: event.id,
        expectedVersion: event.version,
        key,
        operation,
        confirmed: true,
        suspendDependents: false,
      });
    }
    await change("website", "enable");
    const page = await cms.create(people.manager, {
      kind: "page",
      locale: "en",
      title: "Event content",
      slug: "website",
      event: { id: event.id, moduleKey: "website" },
    });
    return {
      ...people,
      cms,
      media,
      website,
      page,
      eventId: event.id,
      previews: new CmsPreviewService(db, cms, events, media),
      change,
      publish: async (page: CmsDetail) => {
        event = await website.publication(people.manager, {
          id: event.id,
          expectedVersion: event.version,
          operation: "publish",
          confirmed: true,
          pages: [version(page)],
        });
      },
      publicPage: () => website.publicPage(event.id, "en", "website"),
    };
  }

  it("C06 event content: keeps previews and edits private, retains hidden sections and restores them across website disable", async () => {
    const s = await setup();
    let page = await s.cms.save(s.manager, save(s.page, content()));
    const original = page;
    expect(await s.publicPage()).toBeNull();
    const hidden: CmsData = {
      ...page.draft.data,
      root: {
        props: { eventHiddenSections: ["event-contact", "event-flyer"] },
      },
    };
    const snapshot = await s.previews.create(s.manager, save(page, hidden));
    const snapshotId = new URL(
      snapshot.url,
      "http://127.0.0.1",
    ).searchParams.get("snapshot")!;
    const preview = await s.previews.read(s.manager, page.id, "en", snapshotId);
    expect(preview.page.data).toEqual(hidden);
    expect(
      visibleEventContent(preview.page.data).content.map((b) => b.type),
    ).toEqual(["EventShare"]);
    await expect(
      s.previews.read(s.owner, page.id, "en", snapshotId),
    ).rejects.toMatchObject({ status: 404 });
    expect((await s.cms.detail(s.manager, page.id, "en")).draft.id).toBe(
      original.draft.id,
    );
    await s.publish(page);
    expect((await s.publicPage())?.page.data).toEqual(original.draft.data);
    page = await s.cms.save(s.manager, save(page, hidden));
    expect((await s.publicPage())?.page.data).toEqual(original.draft.data);
    page = await s.cms.publish(s.manager, version(page));
    const published = (await s.publicPage())!.page.data;
    expect(published.content).toEqual(original.draft.data.content);
    expect(visibleEventContent(published).content.map((b) => b.type)).toEqual([
      "EventShare",
    ]);
    page = await s.cms.restore(s.manager, {
      ...version(page),
      revisionId: original.draft.id,
    });
    expect(page.draft.id).not.toBe(original.draft.id);
    expect(page.draft.data).toEqual(original.draft.data);
    expect((await s.publicPage())?.page.data).toEqual(published);
    page = await s.cms.publish(s.manager, version(page));
    const revisionIds = page.revisions.map((revision) => revision.id);
    await s.change("website", "disable");
    expect(await s.publicPage()).toBeNull();
    await expect(s.cms.save(s.manager, save(page))).rejects.toMatchObject({
      code: "EVENT_MODULE_DISABLED",
    });
    await s.change("website", "enable");
    expect((await s.publicPage())?.page.data).toEqual(original.draft.data);
    expect(
      (await s.cms.detail(s.manager, page.id, "en")).revisions.map((r) => r.id),
    ).toEqual(revisionIds);
  });

  it("C06 event content: rejects club/shared/module scope and unsafe contact destinations without changing drafts", async () => {
    const s = await setup();
    const eventBlocks: CmsData["content"] = [
      {
        type: "EventWinners",
        props: { id: "event-winners", version: 1, title: "Demo winners" },
      },
      ...content().content,
      ...referenceEventPage().content.filter((block) =>
        ["EventHero", "EventPractical", "EventImpact", "EventFooter"].includes(
          block.type,
        ),
      ),
      {
        type: "EventPackages",
        props: {
          id: "event-packages",
          version: 1,
          title: "Published packages",
        },
      },
    ];
    for (const kind of ["page", "section", "header", "footer"] as const) {
      const page = await s.cms.create(s.owner, {
        kind,
        locale: "en",
        title: `Club ${kind}`,
        slug: `club-${kind}`,
      });
      for (const block of eventBlocks)
        await expect(
          s.cms.save(
            s.owner,
            save(page, { root: { props: {} }, content: [block] }),
          ),
        ).rejects.toMatchObject({ status: 422 });
      expect((await s.cms.detail(s.owner, page.id, "en")).draft.id).toBe(
        page.draft.id,
      );
    }
    for (const key of ["gallery", "sponsors"] as const) {
      await s.change(key, "enable");
      const page = await s.cms.create(s.manager, {
        kind: "page",
        locale: "en",
        title: `Event ${key}`,
        slug: key,
        event: { id: s.eventId, moduleKey: key },
      });
      for (const block of eventBlocks)
        await expect(
          s.cms.save(
            s.manager,
            save(page, { root: { props: {} }, content: [block] }),
          ),
        ).rejects.toMatchObject({ code: "EVENT_BLOCK_UNSUPPORTED" });
    }
    const contact = content().content[0];
    for (const unsafe of [
      { website: "javascript:alert(1)" },
      { website: "http://example.test" },
      { website: "https://user:password@example.test" },
      { email: "event@example.test?bcc=other@example.test" },
      { email: "event%0A@example.test" },
      { phone: "+352 123\r\nInjected" },
    ]) {
      const data = {
        root: { props: {} },
        content: [{ ...contact, props: { ...contact.props, ...unsafe } }],
      };
      expect(cmsDataSchema.safeParse(data).success).toBe(false);
      await expect(s.cms.save(s.manager, save(s.page, data))).rejects.toThrow();
    }
    expect((await s.cms.detail(s.manager, s.page.id, "en")).draft.id).toBe(
      s.page.draft.id,
    );
  });

  it("C06 event content: rejects private flyer media and protects published and historical image references", async () => {
    const s = await setup();
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#234456" },
    })
      .png()
      .toBuffer();
    const asset = await s.media.upload(s.owner, {
      filename: "synthetic-event-flyer.png",
      bytes,
      title: "Synthetic event flyer",
      alt: "Synthetic test artwork",
    });
    const input = save(s.page, content(asset.id));
    await expect(s.cms.save(s.manager, input)).rejects.toMatchObject({
      code: "MEDIA_NOT_PUBLIC",
    });
    await expect(s.previews.create(s.manager, input)).rejects.toMatchObject({
      code: "MEDIA_NOT_PUBLIC",
    });
    await expect(s.media.read(null, asset.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.cms.save(s.manager, save(s.page, content(randomUUID()))),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    expect((await s.cms.detail(s.manager, s.page.id, "en")).draft.id).toBe(
      s.page.draft.id,
    );
    await s.media.update(s.owner, { id: asset.id, visibility: "public" });
    let page = await s.cms.save(s.manager, input);
    expect(
      (await s.media.usage(s.owner, asset.id)).savedReferences,
    ).toBeGreaterThan(0);
    await s.publish(page);
    expect(
      (await s.media.usage(s.owner, asset.id)).publishedReferences,
    ).toBeGreaterThan(0);
    page = await s.cms.save(
      s.manager,
      save(page, {
        ...page.draft.data,
        root: { props: { eventHiddenSections: ["event-flyer"] } },
      }),
    );
    page = await s.cms.publish(s.manager, version(page));
    expect(
      visibleEventContent((await s.publicPage())!.page.data).content.some(
        (block) => block.type === "EventFlyer",
      ),
    ).toBe(false);
    await expect(
      s.media.update(s.owner, { id: asset.id, visibility: "private" }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    await expect(s.media.delete(s.owner, asset.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    await s.cms.unpublish(s.manager, version(page));
    expect(await s.publicPage()).toBeNull();
    await s.media.update(s.owner, { id: asset.id, visibility: "private" });
    await expect(s.media.delete(s.owner, asset.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    await expect(s.cms.publish(s.manager, version(page))).rejects.toMatchObject(
      {
        code: "MEDIA_NOT_PUBLIC",
      },
    );
  });

  it("C06 event content: publishes the reference layout with protected artwork and visible section navigation", async () => {
    const s = await setup();
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#66543a" },
    })
      .png()
      .toBuffer();
    const asset = await s.media.upload(s.owner, {
      filename: "synthetic-event-introduction.png",
      bytes,
      title: "Synthetic event introduction",
      alt: "Synthetic test artwork",
    });
    const layout = referenceEventPage();
    const hero = layout.content.find((block) => block.type === "EventHero")!;
    hero.props.assetId = asset.id;
    expect(cmsDataSchema.safeParse(layout).success).toBe(true);
    const input = save(s.page, layout);
    await expect(s.cms.save(s.manager, input)).rejects.toMatchObject({
      code: "MEDIA_NOT_PUBLIC",
    });
    await expect(s.previews.create(s.manager, input)).rejects.toMatchObject({
      code: "MEDIA_NOT_PUBLIC",
    });
    await s.media.update(s.owner, { id: asset.id, visibility: "public" });
    let page = await s.cms.save(s.manager, input);
    expect(await s.publicPage()).toBeNull();
    await s.publish(page);
    const original = (await s.publicPage())!;
    expect(original.event.title).toBe("Synthetic event content");
    expect(original.page.data.root.props.eventDesign?.presentation).toBe(
      "reference",
    );
    expect(eventPageNavigation(original.page.data)).toContainEqual({
      label: "The experience",
      href: "#event-section-event-programme",
    });
    const hidden = {
      ...layout,
      root: {
        props: {
          ...layout.root.props,
          eventHiddenSections: ["event-programme"],
        },
      },
    };
    const snapshot = await s.previews.create(s.manager, save(page, hidden));
    const snapshotId = new URL(
      snapshot.url,
      "http://127.0.0.1",
    ).searchParams.get("snapshot")!;
    const preview = await s.previews.read(s.manager, page.id, "en", snapshotId);
    expect(
      eventPageNavigation(preview.page.data).some(
        (item) => item.label === "The experience",
      ),
    ).toBe(false);
    expect((await s.publicPage())!.page.data).toEqual(original.page.data);
    page = await s.cms.save(s.manager, save(page, hidden));
    await s.cms.publish(s.manager, version(page));
    expect(
      eventPageNavigation((await s.publicPage())!.page.data).some(
        (item) => item.label === "The experience",
      ),
    ).toBe(false);
    expect((await s.publicPage())!.page.data.content).toEqual(layout.content);
    await expect(
      s.media.update(s.owner, { id: asset.id, visibility: "private" }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    await expect(s.media.delete(s.owner, asset.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    expect(isSafeLink("#event-section-event-programme")).toBe(true);
    for (const unsafe of [
      "javascript:alert(1)",
      "//example.test",
      "#bad\r\nlink",
      "#bad\\link",
      "https://user:password@example.test",
      "#<script>",
    ]) {
      expect(isSafeLink(unsafe)).toBe(false);
    }
  });

  it("C06 event content: saves all ten layouts and preserves authored content when changing layouts", async () => {
    const s = await setup();
    let page = s.page;
    expect(eventLayouts).toHaveLength(10);
    for (const layout of eventLayouts) {
      page = await s.cms.save(
        s.manager,
        save(page, eventLayoutRecipe(layout.id)),
      );
      expect(page.draft.data.content[0].type).toBe("EventHero");
      expect(page.draft.data.content.at(-1)?.type).toBe("EventFooter");
      expect(page.draft.data.root.props.eventDesign?.primaryColor).toBe(
        layout.primary,
      );
    }
    const original = structuredClone(page.draft.data);
    const merged = mergeEventLayout(original, "conference");
    expect(original).toEqual(page.draft.data);
    for (const block of original.content.filter(
      (block) => block.type !== "EventHero",
    ))
      expect(merged.content).toContainEqual(block);
    await s.cms.save(s.manager, save(page, merged));
    expect(await s.publicPage()).toBeNull();
  });
}
