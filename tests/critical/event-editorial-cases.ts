import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import sharp from "sharp";
import { cmsPreview, eventRevision } from "../../db/schema/editorial-history";
import { clubEvent } from "../../db/schema/events";
import { CmsService } from "../../src/features/cms/CmsService";
import { CmsPreviewService } from "../../src/features/cms/CmsPreviewService";
import { FormService } from "../../src/features/forms/FormService";
import { MediaService } from "../../src/features/media/MediaService";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { EventEditorialService } from "../../src/features/events/EventEditorialService";
import { eventFields } from "../../src/features/events/event_schemas";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";
import { selectPublishedEvents } from "../../src/features/events/event_catalogue";
import {
  defaultEventDesign,
  eventDesignSchema,
  visibleEventContent,
} from "../../src/features/events/event_design";
import type { eventWebsiteChecks } from "./event-website-cases";

const fields = {
  title: "Synthetic editorial event",
  description: "Published description",
  startsAt: "2030-06-12T14:00:00Z",
  endsAt: "2030-06-12T16:00:00Z",
  timezone: "Europe/Luxembourg",
  venue: "Example community room",
  visibility: "public" as const,
};
const version = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const draft = (page: CmsDetail, text = "Original page") => ({
  ...version(page),
  title: text,
  slug: "website",
  description: "Editorial social description",
  socialImageId: null,
  data: {
    root: { props: {} },
    content: [
      {
        type: "Heading",
        props: {
          id: randomUUID(),
          version: 1,
          text,
          level: "h2",
        },
      },
    ],
  },
});

export function eventEditorialChecks(
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
    const editorial = new EventEditorialService(
      db,
      authorization,
      events,
      modules,
      cms,
    );
    const previews = new CmsPreviewService(db, cms, events, media);
    async function create(title = fields.title) {
      let event = await events.create(people.owner, {
        ...fields,
        title,
        managerUserId: people.manager.userId,
      });
      event = await modules.change(people.manager, {
        id: event.id,
        expectedVersion: event.version,
        key: "website",
        operation: "enable",
        confirmed: true,
        suspendDependents: false,
      });
      let page = await cms.create(people.manager, {
        kind: "page",
        locale: "en",
        title,
        slug: "website",
        event: { id: event.id, moduleKey: "website" },
      });
      page = await cms.save(people.manager, draft(page));
      return { event, page };
    }
    return {
      ...get(),
      ...people,
      modules,
      media,
      cms,
      website,
      editorial,
      previews,
      create,
    };
  }

  it("C06 layout: keeps standalone event layout private until publication and restores it only as a draft", async () => {
    const ctx = await setup();
    const { manager, owner, cms, website, previews } = ctx;
    const { event, page: originalPage } = await ctx.create();
    await website.publication(manager, {
      id: event.id,
      expectedVersion: event.version,
      operation: "publish",
      confirmed: true,
      pages: [version(originalPage)],
    });
    const standalone = {
      ...draft(originalPage),
      data: {
        ...originalPage.draft.data,
        root: { props: { eventLayout: "standalone" as const } },
      },
    };
    const snapshot = await previews.create(manager, standalone);
    const snapshotId = new URL(
      snapshot.url,
      "http://127.0.0.1",
    ).searchParams.get("snapshot")!;
    expect(
      (await previews.read(manager, originalPage.id, "en", snapshotId)).page
        .data.root.props.eventLayout,
    ).toBe("standalone");
    expect(
      (await cms.detail(manager, originalPage.id, "en")).draft.data.root.props
        .eventLayout,
    ).toBeUndefined();
    let page = await cms.save(manager, standalone);
    expect(
      (await cms.preview(manager, page.id, "en")).data.root.props.eventLayout,
    ).toBe("standalone");
    expect(
      (await website.publicPage(event.slug, "en", "website"))?.page.data.root
        .props.eventLayout,
    ).toBeUndefined();
    page = await cms.publish(manager, version(page));
    expect(
      (await website.publicPage(event.slug, "en", "website"))?.page.data.root
        .props.eventLayout,
    ).toBe("standalone");
    page = await cms.restore(manager, {
      ...version(page),
      revisionId: originalPage.draft.id,
    });
    expect(page.draft.data.root.props.eventLayout).toBeUndefined();
    expect(
      (await website.publicPage(event.slug, "en", "website"))?.page.data.root
        .props.eventLayout,
    ).toBe("standalone");
    const clubPage = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Club page",
      slug: "club-page",
    });
    await expect(
      cms.save(owner, {
        ...draft(clubPage),
        data: standalone.data,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await cms.detail(owner, clubPage.id, "en")).draft.id).toBe(
      clubPage.draft.id,
    );
  });

  it("C06 event design: publishes independent design and section visibility while retaining revision content", async () => {
    const ctx = await setup();
    const { manager, owner, cms, website, previews } = ctx;
    const { event, page: original } = await ctx.create();
    await website.publication(manager, {
      id: event.id,
      expectedVersion: event.version,
      operation: "publish",
      confirmed: true,
      pages: [version(original)],
    });
    const visible = draft(original, "Visible section").data.content[0];
    const design = {
      ...defaultEventDesign,
      palette: "berry" as const,
      primaryColor: "#6D287A",
    };
    const content = [...original.draft.data.content, visible];
    const props = {
      eventDesign: design,
      eventHiddenSections: [original.draft.data.content[0].props.id],
    };
    const input = { ...draft(original), data: { root: { props }, content } };
    const snapshot = await previews.create(manager, input);
    const preview = await previews.read(
      manager,
      original.id,
      "en",
      new URL(snapshot.url, "http://127.0.0.1").searchParams.get("snapshot")!,
    );
    expect(preview.page.data.root.props).toEqual(props);
    expect(visibleEventContent(preview.page.data).content).toEqual([visible]);
    expect(preview.page.data.content).toEqual(content);
    expect((await cms.detail(manager, original.id, "en")).draft.data).toEqual(
      original.draft.data,
    );
    let page = await cms.save(manager, input);
    expect(
      (await website.publicPage(event.id, "en", "website"))?.page.data,
    ).toEqual(original.draft.data);
    page = await cms.publish(manager, version(page));
    const published = (await website.publicPage(event.id, "en", "website"))!
      .page.data;
    expect(published.root.props).toEqual(props);
    expect(published.content).toEqual(content);
    expect(visibleEventContent(published).content).toEqual([visible]);
    page = await cms.restore(manager, {
      ...version(page),
      revisionId: original.draft.id,
    });
    expect(page.draft.data).toEqual(original.draft.data);
    expect(
      (await website.publicPage(event.id, "en", "website"))?.page.data,
    ).toEqual(published);
    const clubPage = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Club design boundary",
      slug: "club-design-boundary",
    });
    for (const eventProps of [
      { eventDesign: design },
      { eventHiddenSections: [] },
    ])
      await expect(
        cms.save(owner, {
          ...draft(clubPage),
          data: { root: { props: eventProps }, content: [] },
        }),
      ).rejects.toMatchObject({ code: "EVENT_SCOPE_REQUIRED" });
    expect((await cms.detail(owner, clubPage.id, "en")).draft.id).toBe(
      clubPage.draft.id,
    );
    expect(
      eventDesignSchema.safeParse({
        ...design,
        primaryColor: "url(https://example.test/track)",
      }).success,
    ).toBe(false);
    await expect(
      cms.save(manager, {
        ...draft(page),
        data: {
          ...input.data,
          root: {
            props: {
              ...props,
              eventHiddenSections: [visible.props.id, visible.props.id],
            },
          },
        },
      }),
    ).rejects.toThrow();
    expect((await cms.detail(manager, page.id, "en")).draft.id).toBe(
      page.draft.id,
    );
  });

  it("C06 editorial: atomically publishes reviewed event and pages, rejects stale/cross-event input and restores only drafts", async () => {
    const ctx = await setup();
    const { manager, owner, events, cms, website, editorial, db } = ctx;
    let { event, page } = await ctx.create();
    const publish = () => ({
      id: event.id,
      expectedVersion: event.version,
      operation: "publish",
      confirmed: true,
      pages: [version(page)],
    });
    event = await website.publication(manager, publish());
    const initial = await editorial.history(manager, event.id);
    const publishedRevision = initial.revisions.find(
      (item) => item.action === "published",
    )!;
    const oldPage = page;
    event = await events.save(manager, {
      ...eventFields(event),
      title: "Private next edition",
      id: event.id,
      expectedVersion: event.version,
    });
    page = await cms.save(manager, draft(page, "Private page edit"));
    expect(
      (await website.publicPage(event.slug, "en", "website"))?.event.title,
    ).toBe(fields.title);
    expect(
      (await website.publicPage(event.id, "en", "website"))?.page.title,
    ).toBe("Original page");
    await expect(
      website.publication(manager, { ...publish(), pages: [version(oldPage)] }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const other = await ctx.create("Unrelated event");
    await expect(
      website.publication(owner, {
        ...publish(),
        pages: [version(page), version(other.page)],
      }),
    ).rejects.toMatchObject({ code: "EVENT_PAGE_SCOPE" });
    expect((await cms.detail(manager, page.id, "en")).publishedRevisionId).toBe(
      oldPage.draft.id,
    );
    expect(
      (await website.publicPage(event.slug, "en", "website"))?.event.title,
    ).toBe(fields.title);
    event = await website.publication(manager, publish());
    const live = await website.publicPage(event.slug, "en", "website");
    expect(live?.event.title).toBe("Private next edition");
    expect(live?.page.title).toBe("Private page edit");
    expect(live?.page.revisionId).toBe(page.draft.id);
    await expect(
      editorial.restore(owner, {
        id: other.event.id,
        expectedVersion: other.event.version,
        revisionId: publishedRevision.id,
        pages: [],
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    const restored = await editorial.restore(manager, {
      id: event.id,
      expectedVersion: event.version,
      revisionId: publishedRevision.id,
      pages: [version(page)],
      confirmed: true,
    });
    expect(restored.title).toBe(fields.title);
    expect(restored.slug).toBe(event.slug);
    const restoredPage = await cms.detail(manager, page.id, "en");
    expect(restoredPage.draft.title).toBe("Original page");
    expect(restoredPage.draft.id).not.toBe(oldPage.draft.id);
    expect(restoredPage.publishedRevisionId).toBe(page.draft.id);
    expect(
      (await website.publicPage(event.slug, "en", "website"))?.event.title,
    ).toBe("Private next edition");
    await expect(
      db
        .update(eventRevision)
        .set({ action: "saved" })
        .where(eq(eventRevision.id, publishedRevision.id)),
    ).rejects.toBeDefined();
    await expect(website.publication(manager, publish())).rejects.toMatchObject(
      { code: "EVENT_CONFLICT" },
    );
  });

  it("C06 editorial: preview includes unsaved content, is session-bound, expires and rechecks assignment/module access", async () => {
    const ctx = await setup();
    const { manager, owner, cms, previews, events, modules, db } = ctx;
    const { page, event: initialEvent } = await ctx.create();
    let event = initialEvent;
    const payload = {
      ...draft(page, "Unsaved preview paragraph"),
      event: {
        id: event.id,
        expectedVersion: event.version,
        fields: { ...fields, title: "Unsaved event title" },
      },
    };
    const snapshot = await previews.create(manager, payload);
    const id = new URL(snapshot.url, "http://localhost").searchParams.get(
      "snapshot",
    )!;
    const preview = await previews.read(manager, page.id, "en", id);
    expect(preview.page.title).toBe("Unsaved preview paragraph");
    expect(preview.event?.title).toBe("Unsaved event title");
    expect((await cms.detail(manager, page.id, "en")).draft.id).toBe(
      page.draft.id,
    );
    expect((await events.detail(manager, event.id)).title).toBe(fields.title);
    await expect(previews.read(owner, page.id, "en", id)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      previews.read({ ...manager, sessionId: randomUUID() }, page.id, "en", id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      previews.create(manager, {
        ...payload,
        event: { ...payload.event, id: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_SCOPE" });
    await db
      .update(cmsPreview)
      .set({ expiresAt: new Date(0) })
      .where(eq(cmsPreview.id, id));
    await expect(
      previews.read(manager, page.id, "en", id),
    ).rejects.toMatchObject({ status: 404 });
    const next = await previews.create(manager, payload);
    const nextId = new URL(next.url, "http://localhost").searchParams.get(
      "snapshot",
    )!;
    event = await modules.change(manager, {
      id: event.id,
      expectedVersion: event.version,
      key: "website",
      operation: "disable",
      confirmed: true,
      suspendDependents: false,
    });
    await expect(
      previews.read(manager, page.id, "en", nextId),
    ).rejects.toBeDefined();
    event = await modules.change(manager, {
      id: event.id,
      expectedVersion: event.version,
      key: "website",
      operation: "enable",
      confirmed: true,
      suspendDependents: false,
    });
    const latest = await previews.create(manager, {
      ...payload,
      event: { ...payload.event, expectedVersion: event.version },
    });
    await events.reassignManager(owner, {
      id: event.id,
      expectedVersion: event.version,
      managerUserId: owner.userId,
      confirmed: true,
    });
    await expect(
      previews.read(
        manager,
        page.id,
        "en",
        new URL(latest.url, "http://localhost").searchParams.get("snapshot")!,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("C06 editorial: only one eligible featured event survives concurrent selection; visibility/archive retain other publications", async () => {
    const ctx = await setup();
    const { owner, manager, editorial, website, events, db } = ctx;
    const first = await ctx.create("First public event");
    const second = await ctx.create("Second public event");
    for (const item of [first, second])
      item.event = await website.publication(manager, {
        id: item.event.id,
        expectedVersion: item.event.version,
        operation: "publish",
        confirmed: true,
        pages: [version(item.page)],
      });
    const input = (event: typeof first.event) => ({
      id: event.id,
      expectedVersion: event.version,
      featured: true,
      expectedFeaturedId: null,
      confirmed: true,
    });
    await expect(
      editorial.feature(manager, input(first.event)),
    ).rejects.toMatchObject({ status: 403 });
    const results = await Promise.allSettled([
      editorial.feature(owner, input(first.event)),
      editorial.feature(owner, input(second.event)),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    const cards = await website.publicList("en");
    expect(cards).toHaveLength(2);
    expect(selectPublishedEvents(cards, "featured")).toHaveLength(1);
    const selected = (
      await db.select().from(clubEvent).where(eq(clubEvent.featured, true))
    )[0];
    let event = await events.detail(owner, selected.id);
    await events.archive(owner, {
      id: event.id,
      expectedVersion: event.version,
    });
    expect(
      selectPublishedEvents(await website.publicList("en"), "featured"),
    ).toHaveLength(0);
    expect(await website.publicList("en")).toHaveLength(1);
    event = await events.detail(
      owner,
      selected.id === first.event.id ? second.event.id : first.event.id,
    );
    event = await events.save(owner, {
      ...eventFields(event),
      id: event.id,
      expectedVersion: event.version,
      visibility: "private",
    });
    event = await website.publication(owner, {
      id: event.id,
      expectedVersion: event.version,
      operation: "publish",
      confirmed: true,
    });
    await expect(editorial.feature(owner, input(event))).rejects.toMatchObject({
      code: "EVENT_FEATURED_UNAVAILABLE",
    });
  });

  it("C06 editorial: unsaved preview rejects private media and unsupported executable blocks without saving", async () => {
    const ctx = await setup();
    const { owner, manager, previews, media, cms } = ctx;
    const { page } = await ctx.create();
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#234456" },
    })
      .png()
      .toBuffer();
    const asset = await media.upload(owner, {
      filename: "synthetic.png",
      bytes: image,
      title: "Private editorial fixture",
      alt: "Synthetic square",
    });
    await expect(
      previews.create(manager, { ...draft(page), socialImageId: asset.id }),
    ).rejects.toBeDefined();
    await expect(
      previews.create(manager, {
        ...draft(page),
        data: {
          root: { props: {} },
          content: [{ type: "Script", props: { code: "alert(1)" } }],
        },
      }),
    ).rejects.toBeDefined();
    expect((await cms.detail(manager, page.id, "en")).draft.id).toBe(
      page.draft.id,
    );
  });
}
