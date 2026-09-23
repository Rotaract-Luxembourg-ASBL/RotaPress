import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { eventManager } from "../../db/schema/events";
import { eventPrize, eventPrizeRevision } from "../../db/schema/event-prizes";
import { CmsService } from "../../src/features/cms/CmsService";
import { CmsEventCopyService } from "../../src/features/cms/CmsEventCopyService";
import { CmsPartnerUsage } from "../../src/features/cms/CmsPartnerUsage";
import type { CmsData, CmsDetail } from "../../src/features/cms/cms_schemas";
import { FormService } from "../../src/features/forms/FormService";
import { FormEventCopyService } from "../../src/features/forms/FormEventCopyService";
import { MediaService } from "../../src/features/media/MediaService";
import { MembershipService } from "../../src/features/members/MembershipService";
import { PartnerService } from "../../src/features/partners/PartnerService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventPrizeService } from "../../src/features/events/EventPrizeService";
import { EventReadinessService } from "../../src/features/events/EventReadinessService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { EventCancellationService } from "../../src/features/events/EventCancellationService";
import { EventTemplateService } from "../../src/features/events/EventTemplateService";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import type { EventModuleKey } from "../../src/features/events/event_modules";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import type { eventWebsiteChecks } from "./event-website-cases";

const fields = {
  title: "Synthetic prize event",
  description: "An editorial showcase with no entry or payment rights",
  startsAt: "2030-06-12T14:00:00Z",
  endsAt: null,
  timezone: "Europe/Luxembourg",
  venue: "Example community room",
  visibility: "public" as const,
};
const draft = {
  title: "Synthetic donated prize",
  description: "A descriptive local prize",
  imageId: null as string | null,
  alt: "",
  quantity: 2,
  position: 20,
  partnerId: null as string | null,
};
const profile = {
  name: "Synthetic prize donor",
  description: "Public donor information",
  category: "sponsor" as const,
  website: "https://example.test/donor",
  logoId: null,
};
const confirmed = (version: number) => ({
  expectedVersion: version,
  confirmed: true,
});
const pageVersion = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const savePage = (page: CmsDetail, data: CmsData) => ({
  ...pageVersion(page),
  title: page.draft.title,
  slug: page.draft.slug,
  description: page.draft.description,
  socialImageId: page.draft.socialImageId,
  data,
});
const gallery = (hidden = false): CmsData => ({
  root: { props: hidden ? { eventHiddenSections: ["prize-gallery"] } : {} },
  content: [
    {
      type: "EventPrizes",
      props: { id: "prize-gallery", version: 1, title: "Published prizes" },
    },
  ],
});

export function eventPrizeChecks(
  get: Parameters<typeof eventWebsiteChecks>[0],
) {
  async function setup() {
    const { db, authorization, events, club, actor } = get();
    const people = await club();
    const modules = new EventModuleService(db, events);
    const media = new MediaService(
      db,
      authorization,
      new LocalStorageDriver(resolve(".local/test-uploads")),
    );
    const forms = new FormService(db, authorization);
    const registrations = new RegistrationService(
      db,
      authorization,
      new MembershipService(db, authorization, forms),
    );
    const cms = new CmsService(
      db,
      authorization,
      media,
      forms,
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
    const prizes = new EventPrizeService(
      db,
      authorization,
      events,
      modules,
      media,
    );
    const readiness = new EventReadinessService(
      db,
      authorization,
      events,
      modules,
      cms,
      forms,
      registrations,
    );
    const partners = new PartnerService(
      db,
      authorization,
      media,
      new CmsPartnerUsage(),
    );
    const cancellations = new EventCancellationService(
      db,
      authorization,
      events,
      registrations,
    );
    const templates = new EventTemplateService(
      db,
      authorization,
      events,
      modules,
      new CmsEventCopyService(db, authorization, media, events, modules),
      new FormEventCopyService(),
      registrations,
      media,
    );
    const event = await events.create(people.owner, {
      ...fields,
      managerUserId: people.manager.userId,
    });
    async function change(
      key: EventModuleKey,
      operation: "enable" | "disable",
    ) {
      return modules.change(people.manager, {
        id: event.id,
        ...confirmed((await events.detail(people.manager, event.id)).version),
        key,
        operation,
        suspendDependents: key === "website" && operation === "disable",
      });
    }
    await change("website", "enable");
    await change("prizes", "enable");
    const page = await cms.create(people.manager, {
      kind: "page",
      locale: "en",
      title: "Synthetic prize showcase",
      slug: "website",
      event: { id: event.id, moduleKey: "website" },
    });
    await cms.publish(people.manager, {
      id: page.id,
      locale: page.locale,
      expectedRevisionId: page.draft.id,
    });
    const publishEvent = async (
      operation: "publish" | "unpublish" = "publish",
    ) =>
      website.publication(people.manager, {
        id: event.id,
        ...confirmed((await events.detail(people.manager, event.id)).version),
        operation,
      });
    const current = async (id: string) => {
      const item = (
        await prizes.workspace(people.manager, event.id)
      ).items.find((row) => row.id === id);
      if (!item) throw new Error("Synthetic prize is missing.");
      return item;
    };
    const publish = async (
      id: string,
      operation: "publish" | "unpublish" = "publish",
    ) =>
      prizes.publication(people.manager, event.id, id, {
        ...confirmed((await current(id)).version),
        operation,
      });
    return {
      ...people,
      db,
      actor,
      events,
      event,
      modules,
      media,
      prizes,
      cms,
      page,
      website,
      prizeReadiness: async () =>
        (await readiness.read(people.manager, event.id)).modules.find(
          (row) => row.key === "prizes",
        )!,
      partners,
      cancellations,
      templates,
      change,
      publishEvent,
      current,
      publish,
    };
  }

  it("C06/C04 prizes: keeps ordered publications immutable, rejects stale review, and copies only retained drafts", async () => {
    const s = await setup();
    const clubPage = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Club page",
      slug: "club-page",
    });
    await expect(
      s.cms.save(s.owner, savePage(clubPage, gallery())),
    ).rejects.toMatchObject({ code: "EVENT_SCOPE_REQUIRED" });
    const first = (
      await s.prizes.save(s.manager, s.event.id, { expectedVersion: 0, draft })
    ).items[0];
    const second = (
      await s.prizes.save(s.manager, s.event.id, {
        expectedVersion: 0,
        draft: { ...draft, title: "First displayed prize", position: 1 },
      })
    ).items.find((item) => item.id !== first.id)!;
    expect(await s.prizes.published(null, s.event.id)).toEqual([]);
    await s.publish(first.id);
    await s.publish(second.id);
    expect(await s.prizes.published(null, s.event.id)).toEqual([]);
    await s.publishEvent();
    const original = await s.prizes.published(null, s.event.id);
    expect(original.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(original[1]).toMatchObject({
      title: draft.title,
      quantity: 2,
      partner: null,
    });
    expect(original[1]).not.toHaveProperty("partnerId");

    const beforeEdit = await s.current(first.id);
    const nextDraft = {
      ...draft,
      title: "Next private prize description",
      quantity: 3,
      position: 0,
    };
    await s.prizes.save(s.manager, s.event.id, {
      id: first.id,
      expectedVersion: beforeEdit.version,
      draft: nextDraft,
    });
    expect(await s.prizes.published(null, s.event.id)).toEqual(original);
    await expect(
      s.prizes.publication(s.manager, s.event.id, first.id, {
        ...confirmed(beforeEdit.version),
        operation: "publish",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.prizes.publication(s.manager, s.event.id, first.id, {
        expectedVersion: (await s.current(first.id)).version,
        operation: "publish",
      }),
    ).rejects.toThrow();
    await s.publish(first.id);
    const latest = await s.prizes.published(null, s.event.id);
    expect(latest.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(latest[0]).toMatchObject({ title: nextDraft.title, quantity: 3 });
    const history = await s.db
      .select()
      .from(eventPrizeRevision)
      .where(eq(eventPrizeRevision.prizeId, first.id));
    expect(history).toHaveLength(2);
    await expect(
      s.db
        .update(eventPrizeRevision)
        .set({ snapshot: draft })
        .where(eq(eventPrizeRevision.id, history[0].id)),
    ).rejects.toThrow();
    await expect(
      s.db
        .delete(eventPrizeRevision)
        .where(eq(eventPrizeRevision.id, history[0].id)),
    ).rejects.toThrow();

    const input = {
      event: {
        ...fields,
        title: "Copied prize event",
        managerUserId: s.manager.userId,
      },
      template: { kind: "copy", id: s.event.id },
    };
    const review = await s.templates.preview(s.owner, input);
    const copiedDraft = {
      ...nextDraft,
      description: "Private copy preserves this draft",
    };
    await s.prizes.save(s.manager, s.event.id, {
      id: first.id,
      expectedVersion: (await s.current(first.id)).version,
      draft: copiedDraft,
    });
    const requestId = randomUUID();
    await expect(
      s.templates.create(s.owner, {
        ...input,
        reviewToken: review.token,
        requestId,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "EVENT_TEMPLATE_REVIEW_CHANGED" });
    expect(await s.events.list(s.owner)).toHaveLength(1);
    const refreshed = await s.templates.preview(s.owner, input);
    expect(refreshed.token).not.toBe(review.token);
    const copied = await s.templates.create(s.owner, {
      ...input,
      reviewToken: refreshed.token,
      requestId,
      confirmed: true,
    });
    const copy = await s.prizes.workspace(s.manager, copied.id);
    expect(copy.items).toHaveLength(2);
    expect(copy.items.map((item) => item.draft)).toEqual([
      copiedDraft,
      { ...draft, title: "First displayed prize", position: 1 },
    ]);
    expect(
      copy.items.every(
        (item) =>
          item.published === null && ![first.id, second.id].includes(item.id),
      ),
    ).toBe(true);
    expect(await s.prizes.published(null, copied.id)).toEqual([]);
    expect(await s.prizes.published(null, s.event.id)).toEqual(latest);
    await s.publish(first.id, "unpublish");
    expect((await s.current(first.id)).draft).toEqual(copiedDraft);
    expect(
      (await s.prizes.published(null, s.event.id)).map((item) => item.id),
    ).toEqual([second.id]);
    expect(
      await s.db
        .select()
        .from(eventPrizeRevision)
        .where(eq(eventPrizeRevision.prizeId, first.id)),
    ).toHaveLength(2);
  });

  it("C06/C04 prizes: enforces event and publication scope while retaining gallery records across feature and event lifecycle", async () => {
    const s = await setup();
    let galleryPage = await s.cms.save(s.manager, savePage(s.page, gallery()));
    galleryPage = await s.cms.publish(s.manager, pageVersion(galleryPage));
    await s.publishEvent();
    expect(await s.prizeReadiness()).toMatchObject({
      available: false,
      reasons: expect.arrayContaining(["Add and publish a prize in Prizes."]),
    });
    const editor = await s.actor("prize-editor");
    await s.db.insert(membership).values({
      organizationId: s.scope.organizationId,
      userId: editor.userId,
      role: "member",
      status: "approved",
    });
    await s.db.insert(eventManager).values({
      organizationId: s.scope.organizationId,
      eventId: s.event.id,
      userId: editor.userId,
      role: "editor",
    });
    const item = (
      await s.prizes.save(editor, s.event.id, { expectedVersion: 0, draft })
    ).items[0];
    expect(await s.prizes.workspace(editor, s.event.id)).toMatchObject({
      canEdit: true,
      canPublish: false,
    });
    await expect(
      s.prizes.publication(editor, s.event.id, item.id, {
        ...confirmed(item.version),
        operation: "publish",
      }),
    ).rejects.toThrow();
    await s.publish(item.id);
    await s.publishEvent();
    expect(await s.prizeReadiness()).toMatchObject({
      available: true,
      reasons: [],
    });
    galleryPage = await s.cms.save(
      s.manager,
      savePage(galleryPage, gallery(true)),
    );
    expect((await s.prizeReadiness()).available).toBe(true);
    galleryPage = await s.cms.publish(s.manager, pageVersion(galleryPage));
    expect((await s.prizeReadiness()).available).toBe(false);
    galleryPage = await s.cms.save(s.manager, savePage(galleryPage, gallery()));
    expect((await s.prizeReadiness()).available).toBe(false);
    galleryPage = await s.cms.publish(s.manager, pageVersion(galleryPage));
    expect((await s.prizeReadiness()).available).toBe(true);
    const published = await s.prizes.published(null, s.event.id);
    const other = await s.events.create(s.owner, {
      ...fields,
      managerUserId: s.owner.userId,
    });
    await expect(s.prizes.workspace(s.manager, other.id)).rejects.toThrow();
    await expect(
      s.prizes.save(s.owner, other.id, {
        id: item.id,
        expectedVersion: (await s.current(item.id)).version,
        draft,
      }),
    ).rejects.toThrow();
    await expect(
      s.prizes.publication(s.owner, other.id, item.id, {
        ...confirmed((await s.current(item.id)).version),
        operation: "unpublish",
      }),
    ).rejects.toThrow();
    const [revision] = await s.db
      .select()
      .from(eventPrizeRevision)
      .where(eq(eventPrizeRevision.prizeId, item.id));
    await expect(
      s.db
        .insert(eventPrizeRevision)
        .values({ ...revision, id: randomUUID(), eventId: other.id }),
    ).rejects.toThrow();
    await expect(
      s.db
        .update(eventPrize)
        .set({ publishedRevisionId: randomUUID() })
        .where(eq(eventPrize.id, item.id)),
    ).rejects.toThrow();
    await s.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, editor.userId));
    await expect(s.prizes.workspace(editor, s.event.id)).rejects.toThrow();

    for (const key of ["prizes", "website"] as const) {
      await s.change(key, "disable");
      if (key === "prizes") {
        // Disabled features retain their saved sections; publishing reviews availability.
        galleryPage = await s.cms.save(
          s.manager,
          savePage(galleryPage, gallery()),
        );
        await expect(
          s.cms.publish(s.manager, pageVersion(galleryPage)),
        ).rejects.toMatchObject({ code: "EVENT_MODULE_DISABLED" });
        await expect(
          s.website.publication(s.manager, {
            id: s.event.id,
            ...confirmed(
              (await s.events.detail(s.manager, s.event.id)).version,
            ),
            operation: "publish",
            pages: [pageVersion(galleryPage)],
          }),
        ).rejects.toMatchObject({ code: "EVENT_MODULE_DISABLED" });
      }
      expect((await s.prizeReadiness()).available).toBe(false);
      expect(await s.prizes.published(null, s.event.id)).toEqual([]);
      expect(await s.prizes.workspace(s.manager, s.event.id)).toMatchObject({
        canEdit: false,
        canPublish: false,
      });
      expect((await s.current(item.id)).published).toEqual(published[0]);
      await expect(
        s.prizes.save(s.manager, s.event.id, {
          id: item.id,
          expectedVersion: (await s.current(item.id)).version,
          draft,
        }),
      ).rejects.toThrow();
      await expect(s.publish(item.id)).rejects.toThrow();
      await s.change(key, "enable");
      if (key === "website") await s.change("prizes", "enable");
      expect(await s.prizes.published(null, s.event.id)).toEqual(published);
      expect((await s.prizeReadiness()).available).toBe(true);
    }
    await s.publishEvent("unpublish");
    expect(await s.prizes.published(null, s.event.id)).toEqual([]);
    await s.publishEvent();
    expect(await s.prizes.published(null, s.event.id)).toEqual(published);
    await s.events.save(s.manager, {
      ...fields,
      visibility: "private",
      id: s.event.id,
      expectedVersion: (await s.events.detail(s.manager, s.event.id)).version,
    });
    await s.publishEvent();
    expect(await s.prizes.published(null, s.event.id)).toEqual([]);
    expect(await s.prizes.published(s.manager, s.event.id)).toEqual(published);
    await s.events.save(s.manager, {
      ...fields,
      id: s.event.id,
      expectedVersion: (await s.events.detail(s.manager, s.event.id)).version,
    });
    await s.publishEvent();
    const impact = await s.cancellations.preview(s.manager, s.event.id);
    await s.cancellations.cancel(s.manager, {
      id: s.event.id,
      expectedVersion: impact.expectedVersion,
      expectedConfirmed: impact.expectedConfirmed,
      confirmed: true,
    });
    expect(await s.prizes.published(null, s.event.id)).toEqual(published);
    expect(await s.prizes.workspace(s.manager, s.event.id)).toMatchObject({
      canEdit: false,
      canPublish: false,
    });
    await expect(
      s.prizes.save(s.manager, s.event.id, {
        id: item.id,
        expectedVersion: (await s.current(item.id)).version,
        draft,
      }),
    ).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
    await expect(s.publish(item.id)).rejects.toMatchObject({
      code: "EVENT_CANCELLED",
    });
    await s.publish(item.id, "unpublish");
    expect(await s.prizes.published(null, s.event.id)).toEqual([]);
    expect((await s.current(item.id)).draft).toEqual(draft);
  });

  it("C06/C04 prizes: rejects private images and unpublished donors and protects published and retained asset references", async () => {
    const s = await setup();
    const asset = await s.media.upload(s.owner, {
      filename: "synthetic-prize.png",
      title: "Synthetic prize image",
      alt: "Local test artwork",
      bytes: await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#245365" },
      })
        .png()
        .toBuffer(),
    });
    await expect(
      s.prizes.save(s.manager, s.event.id, {
        expectedVersion: 0,
        draft: { ...draft, imageId: asset.id, alt: "Private prize image" },
      }),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_PUBLIC" });
    await expect(
      s.prizes.save(s.manager, s.event.id, {
        expectedVersion: 0,
        draft: { ...draft, imageId: randomUUID(), alt: "Missing prize image" },
      }),
    ).rejects.toThrow();
    await expect(s.media.read(null, asset.id)).rejects.toMatchObject({
      status: 404,
    });
    let donor = await s.partners.create(s.owner, profile);
    await expect(
      s.prizes.save(s.manager, s.event.id, {
        expectedVersion: 0,
        draft: { ...draft, partnerId: donor.id },
      }),
    ).rejects.toMatchObject({ code: "PARTNER_NOT_PUBLISHED" });
    await expect(
      s.prizes.save(s.manager, s.event.id, {
        expectedVersion: 0,
        draft: { ...draft, partnerId: randomUUID() },
      }),
    ).rejects.toThrow();
    expect((await s.prizes.workspace(s.manager, s.event.id)).items).toEqual([]);
    donor = await s.partners.change(
      s.owner,
      donor.id,
      "publish",
      confirmed(donor.version),
    );
    await s.media.update(s.owner, { id: asset.id, visibility: "public" });
    const withMedia = {
      ...draft,
      imageId: asset.id,
      alt: "A synthetic donated prize",
      partnerId: donor.id,
    };
    const item = (
      await s.prizes.save(s.manager, s.event.id, {
        expectedVersion: 0,
        draft: withMedia,
      })
    ).items[0];
    await s.publish(item.id);
    await s.publishEvent();
    expect((await s.prizes.published(null, s.event.id))[0]).toMatchObject({
      imageId: asset.id,
      partner: { id: donor.id, name: profile.name },
    });
    const copyInput = {
      event: {
        ...fields,
        title: "Copied prize media",
        managerUserId: s.manager.userId,
      },
      template: { kind: "copy", id: s.event.id },
    };
    const review = await s.templates.preview(s.owner, copyInput);
    const copied = await s.templates.create(s.owner, {
      ...copyInput,
      reviewToken: review.token,
      requestId: randomUUID(),
      confirmed: true,
    });
    const copy = (await s.prizes.workspace(s.manager, copied.id)).items[0];
    expect(copy).toMatchObject({ draft: withMedia, published: null });
    expect(copy.id).not.toBe(item.id);
    donor = await s.partners.change(s.owner, donor.id, "save", {
      expectedVersion: donor.version,
      profile: { ...profile, name: "Private donor update" },
    });
    expect((await s.prizes.published(null, s.event.id))[0].partner?.name).toBe(
      profile.name,
    );
    await expect(
      s.partners.change(
        s.owner,
        donor.id,
        "unpublish",
        confirmed(donor.version),
      ),
    ).rejects.toMatchObject({ code: "PARTNER_IN_USE" });
    await expect(
      s.media.update(s.owner, { id: asset.id, visibility: "private" }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    await expect(s.media.delete(s.owner, asset.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    await s.change("prizes", "disable");
    await expect(
      s.partners.change(
        s.owner,
        donor.id,
        "unpublish",
        confirmed(donor.version),
      ),
    ).rejects.toMatchObject({ code: "PARTNER_IN_USE" });
    await expect(
      s.media.update(s.owner, { id: asset.id, visibility: "private" }),
    ).rejects.toMatchObject({ code: "MEDIA_PUBLISHED_REFERENCE" });
    await s.change("prizes", "enable");
    await s.prizes.save(s.manager, s.event.id, {
      id: item.id,
      expectedVersion: (await s.current(item.id)).version,
      draft,
    });
    expect((await s.prizes.published(null, s.event.id))[0].imageId).toBe(
      asset.id,
    );
    await s.publish(item.id);
    expect((await s.prizes.published(null, s.event.id))[0]).toMatchObject({
      imageId: null,
      partner: null,
    });
    await s.media.update(s.owner, { id: asset.id, visibility: "private" });
    await expect(s.media.delete(s.owner, asset.id)).rejects.toMatchObject({
      code: "MEDIA_REFERENCED",
    });
    donor = await s.partners.change(
      s.owner,
      donor.id,
      "unpublish",
      confirmed(donor.version),
    );
    expect(donor.published).toBeNull();
    const usage = await s.media.usage(s.owner, asset.id);
    expect(usage.publishedReferences).toBe(0);
    expect(usage.savedReferences).toBeGreaterThan(0);
    expect(
      await s.db
        .select()
        .from(eventPrizeRevision)
        .where(eq(eventPrizeRevision.prizeId, item.id)),
    ).toHaveLength(2);
  });
}
