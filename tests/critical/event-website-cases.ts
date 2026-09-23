import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import type { EventFields } from "../../src/features/events/event_schemas";
import { membership } from "../../db/schema/club";
import type {
  AuthorizationService,
  TrustedActor,
  StaffAccess,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { CmsService } from "../../src/features/cms/CmsService";
import type { CmsDetail, CmsData } from "../../src/features/cms/cms_schemas";
import { FormService } from "../../src/features/forms/FormService";
import { MediaService } from "../../src/features/media/MediaService";
import { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { PartnerService } from "../../src/features/partners/PartnerService";
import { CmsPartnerUsage } from "../../src/features/cms/CmsPartnerUsage";
import type { EventModuleKey } from "../../src/features/events/event_modules";
import { selectPublishedEvents } from "../../src/features/events/event_catalogue";
import { communityContent } from "../fixtures/community-content";

type Context = {
  db: Database;
  authorization: AuthorizationService;
  events: EventService;
  club: () => Promise<{
    owner: TrustedActor;
    manager: TrustedActor;
    scope: StaffAccess;
  }>;
  actor: (label: string) => Promise<TrustedActor>;
};
const fields = {
  title: "Synthetic published event",
  description: "Published event description",
  startsAt: "2026-12-01T17:00:00Z",
  endsAt: null,
  timezone: "Europe/Luxembourg",
  venue: "Community room",
  visibility: "public" as const,
};
const heading = (text: string): CmsData => ({
  root: { props: {} },
  content: [
    {
      type: "Heading",
      props: { id: randomUUID(), version: 1, text, level: "h2" },
    },
  ],
});
const save = (page: CmsDetail, data: CmsData = page.draft.data) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
  title: page.draft.title,
  slug: page.draft.slug,
  description: page.draft.description,
  socialImageId: page.draft.socialImageId,
  data,
});
const version = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});

export function eventWebsiteChecks(get: () => Context) {
  async function setup() {
    const { db, authorization, events, club, actor } = get();
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
      ...fields,
      managerUserId: people.manager.userId,
    });
    async function change(
      key: EventModuleKey,
      operation: "enable" | "disable",
      suspendDependents = false,
    ) {
      event = await modules.change(people.manager, {
        id: event.id,
        expectedVersion: event.version,
        key,
        operation,
        suspendDependents,
        confirmed: true,
      });
    }
    async function publish(operation: "publish" | "unpublish" = "publish") {
      event = await website.publication(people.manager, {
        id: event.id,
        expectedVersion: event.version,
        operation,
        confirmed: true,
      });
    }
    async function page(key: EventModuleKey) {
      let page = await cms.create(people.manager, {
        kind: "page",
        locale: "en",
        title: `Event ${key}`,
        slug: key,
        templateId:
          key === "website" ? "rotaract-action:event-detail" : "blank",
        event: { id: event.id, moduleKey: key },
      });
      if (key === "website")
        expect(page.draft.data.content[0].type).toBe("PageIntro");
      page = await cms.save(
        people.manager,
        save(page, heading(`Published ${key}`)),
      );
      return cms.publish(people.manager, version(page));
    }
    return {
      ...people,
      db,
      actor,
      events,
      modules,
      cms,
      media,
      website,
      change,
      publish,
      page,
      event: () => event,
      saveEvent: async (values: Partial<EventFields> = {}) => {
        event = await events.save(people.manager, {
          ...fields,
          ...values,
          id: event.id,
          expectedVersion: event.version,
        });
      },
    };
  }

  it("C06 feeds published public event snapshots into approved rich sections with current preview authorization", async () => {
    const s = await setup();
    await s.change("website", "enable");
    let page = await s.page("website");
    page = await s.cms.save(s.manager, save(page, communityContent("")));
    await s.cms.publish(s.manager, version(page));
    const query = { locale: "en", period: "all", limit: 6 };
    expect(await s.website.catalogue(s.manager, query)).toEqual([]);
    await s.publish();
    const listed = await s.website.catalogue(s.manager, query);
    expect(listed).toHaveLength(1);
    await s.saveEvent({ title: "Private next title" });
    expect(await s.website.catalogue(s.owner, query)).toEqual(listed);
    expect(
      await s.website.catalogue(s.owner, { ...query, locale: "fr" }),
    ).toEqual([]);
    expect(
      selectPublishedEvents(
        listed,
        "upcoming",
        6,
        Date.parse("2026-11-01T00:00:00Z"),
      ),
    ).toHaveLength(1);
    expect(
      selectPublishedEvents(
        listed,
        "past",
        6,
        Date.parse("2026-11-01T00:00:00Z"),
      ),
    ).toEqual([]);
    expect(
      selectPublishedEvents(
        listed,
        "past",
        6,
        Date.parse("2027-01-01T00:00:00Z"),
      ),
    ).toHaveLength(1);
    const ongoing = { ...listed[0], endsAt: "2026-12-02T00:00:00Z" };
    expect(
      selectPublishedEvents(
        [ongoing],
        "upcoming",
        6,
        Date.parse("2026-12-01T18:00:00Z"),
      ),
    ).toHaveLength(1);
    const member = await s.actor("catalogue-member");
    await s.db.insert(membership).values({
      organizationId: s.scope.organizationId,
      userId: member.userId,
      role: "member",
      status: "approved",
    });
    await expect(s.website.catalogue(member, query)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await s.db
      .update(membership)
      .set({ role: "editor" })
      .where(eq(membership.userId, member.userId));
    expect(await s.website.catalogue(member, query)).toEqual(listed);
    await s.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, member.userId));
    await expect(s.website.catalogue(member, query)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await s.change("website", "disable");
    expect(await s.website.catalogue(s.manager, query)).toEqual([]);
  });

  it("C06 excludes an event that becomes unlisted between discovery and projection", async () => {
    const s = await setup();
    await s.change("website", "enable");
    await s.page("website");
    await s.publish();
    const readPage = s.website.publicPage.bind(s.website);
    const read = vi
      .spyOn(s.website, "publicPage")
      .mockImplementationOnce(async (...args) => {
        await s.saveEvent({ visibility: "unlisted" });
        await s.publish();
        return readPage(...args);
      });
    try {
      expect(await s.website.publicList("en")).toEqual([]);
    } finally {
      read.mockRestore();
    }
    expect(
      (await s.website.publicPage(s.event().id, "en", "website"))?.event
        .visibility,
    ).toBe("unlisted");
  });

  it("C06 lets assigned event editors select published shared profiles without managing private partner drafts", async () => {
    const s = await setup();
    const partners = new PartnerService(
      s.db,
      get().authorization,
      s.media,
      new CmsPartnerUsage(),
    );
    let profile = await partners.create(s.owner, {
      name: "Synthetic event supporter",
      category: "sponsor",
      description: "",
      website: "",
      logoId: null,
    });
    await expect(partners.list(s.manager)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await s.change("website", "enable");
    await s.change("sponsors", "enable");
    const page = await s.page("sponsors");
    const data: CmsData = {
      root: { props: {} },
      content: [
        {
          type: "PartnerCollection",
          props: {
            id: "shared-event-partner",
            version: 1,
            title: "Supporters",
            partnerIds: [profile.id],
            presentation: "logos",
          },
        },
      ],
    };
    await expect(s.cms.save(s.manager, save(page, data))).rejects.toMatchObject(
      { code: "PARTNER_NOT_PUBLISHED" },
    );
    profile = await partners.change(s.owner, profile.id, "publish", {
      expectedVersion: profile.version,
      confirmed: true,
    });
    const saved = await s.cms.save(s.manager, save(page, data));
    await s.cms.publish(s.manager, version(saved));
    const clubEditor = await s.actor("partner-library-editor");
    await s.db.insert(membership).values({
      organizationId: s.scope.organizationId,
      userId: clubEditor.userId,
      role: "editor",
      status: "approved",
    });
    expect((await partners.list(clubEditor))[0].placements).toEqual([
      { id: null, title: "Restricted event page", locale: null, eventId: null },
    ]);
    await s.change("sponsors", "disable");
    await expect(
      s.cms.save(s.manager, save(saved, data)),
    ).rejects.toMatchObject({ code: "EVENT_MODULE_DISABLED" });
    await expect(
      partners.change(s.owner, profile.id, "unpublish", {
        expectedVersion: profile.version,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "PARTNER_IN_USE" });
    await s.change("sponsors", "enable");
    expect((await s.cms.detail(s.manager, page.id, "en")).draft.data).toEqual(
      data,
    );
  });

  it("C06 publishes locale-aware event CMS snapshots and preserves content across disable, dependency suspension and reenable", async () => {
    const s = await setup();
    await expect(s.change("gallery", "enable")).rejects.toMatchObject({
      code: "EVENT_DEPENDENCY_REQUIRED",
    });
    await s.change("website", "enable");
    await expect(s.publish()).rejects.toMatchObject({
      code: "EVENT_LANDING_REQUIRED",
    });
    let landing = await s.page("website");
    await s.change("gallery", "enable");
    const gallery = await s.page("gallery");
    expect(
      await s.website.publicPage(s.event().id, "en", "website"),
    ).toBeNull();
    await s.publish();
    expect(
      (
        await s.website.publicPage(s.event().id, "en", "website")
      )?.navigation.map((item) => item.key),
    ).toEqual(["website", "gallery"]);
    expect(
      await s.website.publicPage(s.event().id, "fr", "website"),
    ).toBeNull();
    const french = await s.cms.addLocale(s.manager, {
      id: landing.id,
      locale: "fr",
      title: "Rencontre locale",
      slug: "website",
    });
    await s.cms.publish(s.manager, version(french));
    expect(
      (await s.website.publicPage(s.event().id, "fr", "website"))?.page.title,
    ).toBe("Rencontre locale");
    const beforeTheme = await s.website.workspace(s.manager, s.event().id);
    const site = await s.cms.getSite(s.owner, "en");
    const savedSite = await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: { ...site.draft, themeId: "minimal" },
    });
    await s.cms.activateAppearance(s.owner, {
      locale: "en",
      expectedVersion: savedSite.version,
    });
    expect(await s.website.workspace(s.manager, s.event().id)).toEqual(
      beforeTheme,
    );
    expect(await s.cms.publicPage("en", landing.draft.slug)).toBeNull();
    expect(await s.cms.list(s.owner)).toHaveLength(0);
    expect(await s.cms.publicSitemap()).toHaveLength(0);
    expect(await s.website.publicList("en")).toHaveLength(1);
    await s.saveEvent({ title: "Secret next event name" });
    landing = await s.cms.save(
      s.manager,
      save(landing, heading("Secret next landing copy")),
    );
    expect(
      (await s.website.publicPage(s.event().id, "en", "website"))?.event.title,
    ).toBe(fields.title);
    expect(
      JSON.stringify(await s.website.publicPage(s.event().id, "en", "website")),
    ).not.toContain("Secret");
    expect(
      JSON.stringify(await s.cms.preview(s.manager, landing.id, "en")),
    ).toContain("Secret next landing copy");
    await expect(s.change("website", "disable")).rejects.toMatchObject({
      code: "EVENT_DEPENDENTS_ACTIVE",
    });
    await s.change("website", "disable", true);
    expect(
      await s.website.publicPage(s.event().id, "en", "gallery"),
    ).toBeNull();
    expect(await s.website.publicList("en")).toHaveLength(0);
    expect(
      (await s.cms.detail(s.manager, gallery.id, "en")).publishedRevisionId,
    ).toBe(gallery.draft.id);
    await expect(s.cms.save(s.manager, save(gallery))).rejects.toMatchObject({
      code: "EVENT_MODULE_DISABLED",
    });
    await s.change("website", "enable");
    expect(
      (await s.website.publicPage(s.event().id, "en", "website"))?.navigation,
    ).toHaveLength(1);
    await s.change("gallery", "enable");
    expect(
      (await s.website.publicPage(s.event().id, "en", "gallery"))?.page.id,
    ).toBe(gallery.id);
    const restored = await s.cms.restore(s.manager, {
      ...version(landing),
      revisionId: landing.revisions.at(-1)!.id,
    });
    expect(restored.publishedRevisionId).toBe(landing.publishedRevisionId);
    await s.publish("unpublish");
    expect(
      await s.website.publicPage(s.event().id, "en", "website"),
    ).toBeNull();
  });

  it("C06 enforces event editor scope, current permissions, approved blocks and private media without granting club CMS access", async () => {
    const s = await setup();
    await s.change("website", "enable");
    const landing = await s.page("website");
    const editor = await s.actor("scoped-cms-editor");
    const clubEditor = await s.actor("club-only-editor");
    await s.db.insert(membership).values({
      organizationId: s.scope.organizationId,
      userId: clubEditor.userId,
      status: "approved",
      role: "editor",
    });
    await expect(
      s.cms.detail(clubEditor, landing.id, "en"),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    expect(await s.cms.list(clubEditor)).toHaveLength(0);
    const site = await s.cms.getSite(clubEditor, "en");
    await expect(
      s.cms.saveSite(clubEditor, {
        locale: "en",
        expectedVersion: site.version,
        settings: { ...site.draft, homePageId: landing.id },
      }),
    ).rejects.toMatchObject({ code: "PAGE_NOT_FOUND" });
    await s.db.insert(membership).values({
      organizationId: s.scope.organizationId,
      userId: editor.userId,
      status: "approved",
      role: "member",
    });
    await s.events.changeEditor(s.manager, {
      id: s.event().id,
      expectedVersion: s.event().version,
      userId: editor.userId,
      operation: "grant",
      confirmed: true,
    });
    const outsider = await s.events.create(s.owner, {
      ...fields,
      title: "Other event",
      managerUserId: s.owner.userId,
    });
    await expect(
      s.cms.create(editor, {
        kind: "page",
        locale: "en",
        title: "No scope",
        slug: "no-scope",
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      s.cms.create(editor, {
        kind: "page",
        locale: "en",
        title: "Other event",
        slug: "other",
        event: { id: outsider.id, moduleKey: "website" },
      }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await expect(s.cms.list(editor)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    const changed = await s.cms.save(
      editor,
      save(landing, heading("Scoped editor draft")),
    );
    expect(
      (await s.cms.detail(editor, landing.id, "en")).event?.canPublish,
    ).toBe(false);
    await expect(s.cms.publish(editor, version(changed))).rejects.toMatchObject(
      { code: "EVENT_ACCESS_DENIED" },
    );
    await expect(
      s.cms.duplicate(editor, {
        id: landing.id,
        locale: "en",
        title: "Copied",
        slug: "copied",
      }),
    ).rejects.toMatchObject({ code: "SITE_PART_SINGLETON" });
    await expect(
      s.modules.change(editor, {
        id: s.event().id,
        expectedVersion: s.event().version + 1,
        key: "sponsors",
        operation: "enable",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "EVENT_ACCESS_DENIED" });
    await expect(
      s.cms.save(
        editor,
        save(changed, {
          root: { props: {} },
          content: [
            {
              type: "Sponsors",
              props: { id: "forged-module", version: 1, items: [] },
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_BLOCK_UNSUPPORTED" });
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#25636b" },
    })
      .png()
      .toBuffer();
    const asset = await s.media.upload(s.owner, {
      bytes,
      filename: "synthetic-event.png",
      title: "Private event test",
      alt: "Synthetic square",
    });
    expect(await s.media.publicLibrary(editor)).toHaveLength(0);
    await expect(
      s.cms.save(editor, { ...save(changed), socialImageId: asset.id }),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    expect((await s.cms.detail(editor, landing.id, "en")).draft.id).toBe(
      changed.draft.id,
    );
    await s.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, editor.userId));
    await expect(s.cms.preview(editor, landing.id, "en")).rejects.toMatchObject(
      { code: "ACCESS_DENIED" },
    );
  });

  it("C06 respects private/unlisted visibility and keeps different event feature sets independent", async () => {
    const s = await setup();
    await s.change("website", "enable");
    await s.page("website");
    const second = await s.events.create(s.owner, {
      ...fields,
      title: "Second feature set",
      visibility: "private",
      managerUserId: s.owner.userId,
    });
    let eventB = await s.modules.change(s.owner, {
      id: second.id,
      expectedVersion: second.version,
      key: "website",
      operation: "enable",
      confirmed: true,
    });
    const pageB = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Private B",
      slug: "website",
      event: { id: eventB.id, moduleKey: "website" },
    });
    await s.cms.publish(s.owner, version(pageB));
    eventB = await s.website.publication(s.owner, {
      id: eventB.id,
      expectedVersion: eventB.version,
      operation: "publish",
      confirmed: true,
    });
    expect(await s.website.publicPage(eventB.id, "en", "website")).toBeNull();
    expect(
      await s.website.publicPage(eventB.id, "en", "website", s.manager),
    ).toBeNull();
    expect(
      (await s.website.publicPage(eventB.id, "en", "website", s.owner))?.page
        .title,
    ).toBe("Private B");
    await expect(
      s.cms.preview(s.manager, pageB.id, "en"),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await s.change("sponsors", "enable");
    await s.page("sponsors");
    await s.publish();
    expect(
      (await s.website.publicPage(s.event().id, "en", "website"))?.navigation,
    ).toHaveLength(2);
    expect(
      (await s.website.publicPage(eventB.id, "en", "website", s.owner))
        ?.navigation,
    ).toHaveLength(1);
    eventB = await s.events.save(s.owner, {
      ...fields,
      visibility: "unlisted",
      id: eventB.id,
      expectedVersion: eventB.version,
    });
    eventB = await s.website.publication(s.owner, {
      id: eventB.id,
      expectedVersion: eventB.version,
      operation: "publish",
      confirmed: true,
    });
    expect(
      await s.website.publicPage(eventB.id, "en", "website"),
    ).not.toBeNull();
    expect((await s.website.publicList("en")).map((event) => event.id)).toEqual(
      [s.event().id],
    );
    await s.events.archive(s.owner, {
      id: eventB.id,
      expectedVersion: eventB.version,
    });
    expect(
      await s.website.publicPage(eventB.id, "en", "website", s.owner),
    ).toBeNull();
  });
}
