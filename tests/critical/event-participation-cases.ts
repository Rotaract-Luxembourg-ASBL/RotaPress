import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { CmsService } from "../../src/features/cms/CmsService";
import type { CmsData, CmsDetail } from "../../src/features/cms/cms_schemas";
import { FormService } from "../../src/features/forms/FormService";
import { MediaService } from "../../src/features/media/MediaService";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import { EventReadinessService } from "../../src/features/events/EventReadinessService";
import { FeatureService } from "../../src/core/features/FeatureService";
import { MembershipService } from "../../src/features/members/MembershipService";
import { eventFields } from "../../src/features/events/event_schemas";
import type { EventModuleKey } from "../../src/features/events/event_modules";
import type { eventWebsiteChecks } from "./event-website-cases";

const version = (page: CmsDetail) => ({
  id: page.id,
  locale: page.locale,
  expectedRevisionId: page.draft.id,
});
const save = (page: CmsDetail, data: CmsData) => ({
  ...version(page),
  title: page.draft.title,
  slug: page.draft.slug,
  description: page.draft.description,
  socialImageId: page.draft.socialImageId,
  data,
});
const formContent = (formId: string): CmsData => ({
  root: { props: {} },
  content: [{ type: "Form", props: { id: randomUUID(), version: 1, formId } }],
});

export function eventParticipationChecks(
  get: Parameters<typeof eventWebsiteChecks>[0],
) {
  async function setup() {
    const { db, authorization, events, club } = get();
    const people = await club();
    const modules = new EventModuleService(db, events);
    const forms = new FormService(db, authorization);
    const media = new MediaService(
      db,
      authorization,
      new LocalStorageDriver(resolve(".local/test-uploads")),
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
    const registrations = new RegistrationService(
      db,
      authorization,
      new MembershipService(db, authorization, forms),
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
    let event = await events.create(people.owner, {
      title: "Synthetic page participation",
      description: "Event form scope checks",
      startsAt: "2030-06-12T14:00:00Z",
      endsAt: null,
      timezone: "Europe/Luxembourg",
      venue: "Synthetic venue",
      visibility: "public",
      managerUserId: people.manager.userId,
    });
    async function change(
      key: EventModuleKey,
      operation: "enable" | "disable",
    ) {
      event = await modules.change(people.manager, {
        id: event.id,
        expectedVersion: (await events.detail(people.manager, event.id))
          .version,
        key,
        operation,
        confirmed: true,
      });
    }
    await change("website", "enable");
    await change("forms", "enable");
    const page = await cms.create(people.manager, {
      kind: "page",
      locale: "en",
      title: "Event landing page",
      slug: "website",
      event: { id: event.id, moduleKey: "website" },
    });
    const enquiry = await forms.createEventForm(people.manager, event.id, {
      kind: "event",
      title: "Event enquiry",
    });
    return {
      ...people,
      ...get(),
      cms,
      forms,
      modules,
      website,
      registrations,
      readiness,
      page,
      enquiry,
      change,
      event: () => event,
    };
  }

  async function publishParticipation(s: Awaited<ReturnType<typeof setup>>) {
    await s.change("registration", "enable");
    const booking = await s.forms.createEventForm(s.manager, s.event().id, {
      kind: "registration",
      title: "Synthetic readiness booking",
    });
    for (const form of [s.enquiry, booking])
      await s.forms.publish(s.manager, form.id, {
        expectedRevision: form.draftRevision,
      });
    await s.registrations.configure(s.manager, s.event().id, {
      expectedVersion: 0,
      authority: "native",
      formId: booking.id,
      capacity: 20,
      open: true,
      confirmed: true,
    });
    const content = formContent(s.enquiry.id);
    content.content.push({
      type: "EventRegistration",
      props: { id: randomUUID(), version: 1 },
    });
    const page = await s.cms.save(s.manager, save(s.page, content));
    await s.website.publication(s.manager, {
      id: s.event().id,
      expectedVersion: (await s.events.detail(s.manager, s.event().id)).version,
      operation: "publish",
      confirmed: true,
      pages: [version(page)],
    });
    return { page, booking };
  }

  it("C06 readiness: distinguishes hidden saved sections from actual published placement and unavailable forms", async () => {
    const s = await setup();
    const initial = await s.readiness.read(s.manager, s.event().id);
    expect(initial.forms).toMatchObject({
      publishedCount: 0,
      available: false,
      placement: { draft: false, published: false, live: false },
    });
    expect(initial.registration).toMatchObject({
      authority: "none",
      formPublished: false,
      open: false,
      available: false,
    });
    const prepared = await publishParticipation(s);
    let page = prepared.page;
    let state = await s.readiness.read(s.manager, s.event().id);
    for (const feature of [state.forms, state.registration]) {
      expect(feature.available).toBe(true);
      expect(feature.placement).toMatchObject({
        draft: true,
        published: true,
        live: true,
      });
    }
    expect(state.forms.publishedCount).toBe(1);
    for (const [expectedVersion, open] of [
      [1, false],
      [2, true],
    ] as const) {
      await s.registrations.configure(s.manager, s.event().id, {
        expectedVersion,
        authority: "native",
        formId: prepared.booking.id,
        capacity: 20,
        open,
        confirmed: true,
      });
      const result = await s.readiness.read(s.manager, s.event().id);
      expect(result.registration.available).toBe(open);
      // Closing bookings leaves the published closed-registration card visible.
      expect(result.registration.placement.live).toBe(true);
      expect((await s.registrations.publicForm(null, s.event().id)).open).toBe(
        open,
      );
    }

    // A later unrelated draft must not erase the live revision's placement.
    page = await s.cms.save(s.manager, {
      ...save(page, page.draft.data),
      description: "Unpublished metadata change",
    });
    expect(page.publishedRevisionId).not.toBe(page.draft.id);
    expect(
      (await s.readiness.read(s.manager, s.event().id)).registration.placement,
    ).toMatchObject({ draft: true, published: true, live: true });

    const hidden = page.draft.data.content.map((block) => block.props.id);
    page = await s.cms.save(
      s.manager,
      save(page, {
        ...page.draft.data,
        root: {
          props: { ...page.draft.data.root.props, eventHiddenSections: hidden },
        },
      }),
    );
    state = await s.readiness.read(s.manager, s.event().id);
    for (const feature of [state.forms, state.registration])
      expect(feature.placement).toMatchObject({
        draft: false,
        published: true,
        live: true,
      });
    page = await s.cms.publish(s.manager, version(page));
    state = await s.readiness.read(s.manager, s.event().id);
    for (const feature of [state.forms, state.registration]) {
      expect(feature.available).toBe(true);
      expect(feature.placement).toMatchObject({
        draft: false,
        published: false,
        live: false,
      });
    }
    expect(page.draft.data.content).toHaveLength(2);

    page = await s.cms.save(
      s.manager,
      save(page, {
        ...page.draft.data,
        root: {
          props: { ...page.draft.data.root.props, eventHiddenSections: [] },
        },
      }),
    );
    await s.cms.publish(s.manager, version(page));
    for (const form of [s.enquiry, prepared.booking])
      await s.forms.archive(s.manager, form.id, {
        expectedRevision: form.draftRevision,
        archived: true,
      });
    state = await s.readiness.read(s.manager, s.event().id);
    expect(state.forms).toMatchObject({ publishedCount: 0, available: false });
    expect(state.registration).toMatchObject({
      formPublished: false,
      available: false,
    });
    expect(state.forms.placement.live).toBe(false);
    expect(state.registration.placement.live).toBe(false);
  });

  it("C06 readiness: protects scoped configuration and reports dependency, club, private and archive gates", async () => {
    const s = await setup();
    await publishParticipation(s);
    const editor = await s.actor("readiness-editor");
    const reviewer = await s.actor("readiness-registration-manager");
    const outsider = await s.actor("readiness-outsider");
    await s.db.insert(membership).values(
      [editor, reviewer, outsider].map((actor) => ({
        organizationId: s.scope.organizationId,
        userId: actor.userId,
        role: "member" as const,
        status: "approved" as const,
      })),
    );
    for (const [actor, role] of [
      [editor, "editor"],
      [reviewer, "registration-manager"],
    ] as const) {
      await s.events.changeEditor(s.manager, {
        id: s.event().id,
        expectedVersion: (await s.events.detail(s.manager, s.event().id))
          .version,
        userId: actor.userId,
        role,
        operation: "grant",
        confirmed: true,
      });
      const result = await s.readiness.read(actor, s.event().id);
      expect(result.registration.available).toBe(true);
      expect(result.registration.placement.pages[0].editorHref !== null).toBe(
        role === "editor",
      );
      const serialized = JSON.stringify(result);
      for (const forbidden of [
        "confirmedCount",
        "answers",
        "questions",
        "email",
        "submission",
        actor.email,
        s.enquiry.draft.title,
      ])
        expect(serialized).not.toContain(forbidden);
    }
    await expect(
      s.readiness.read(outsider, s.event().id),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await s.events.changeEditor(s.manager, {
      id: s.event().id,
      expectedVersion: (await s.events.detail(s.manager, s.event().id)).version,
      userId: editor.userId,
      role: "editor",
      operation: "revoke",
      confirmed: true,
    });
    await expect(s.readiness.read(editor, s.event().id)).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });

    await s.modules.change(s.manager, {
      id: s.event().id,
      expectedVersion: (await s.events.detail(s.manager, s.event().id)).version,
      key: "forms",
      operation: "disable",
      suspendDependents: true,
      confirmed: true,
    });
    let state = await s.readiness.read(s.manager, s.event().id);
    expect(
      state.modules.find((module) => module.key === "registration"),
    ).toMatchObject({ state: "suspended", available: false });
    expect(state.registration.placement).toMatchObject({
      published: true,
      live: false,
    });
    await s.change("forms", "enable");
    await s.change("registration", "enable");
    const features = new FeatureService(s.db, s.authorization);
    await features.configure(s.owner, {
      key: "forms",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    state = await s.readiness.read(s.manager, s.event().id);
    expect(state.forms.available).toBe(false);
    expect(state.registration.available).toBe(false);
    expect(state.registration.placement).toMatchObject({
      published: true,
      live: false,
    });
    await features.configure(s.owner, {
      key: "forms",
      enabled: true,
      expectedVersion: 1,
      confirmed: true,
    });

    const event = await s.events.detail(s.manager, s.event().id);
    const privateEvent = await s.events.save(s.manager, {
      ...eventFields(event),
      id: event.id,
      expectedVersion: event.version,
      visibility: "private",
    });
    await s.website.publication(s.manager, {
      id: event.id,
      expectedVersion: privateEvent.version,
      operation: "publish",
      confirmed: true,
    });
    state = await s.readiness.read(s.manager, event.id);
    expect(state.publishedVisibility).toBe("private");
    expect(state.registration.placement).toMatchObject({
      published: true,
      live: false,
    });
    expect(state.registration.placement.pages[0].publicHref).toBeNull();
    await s.events.archive(s.manager, {
      id: event.id,
      expectedVersion: (await s.events.detail(s.manager, event.id)).version,
    });
    state = await s.readiness.read(s.manager, event.id);
    expect(state.archived).toBe(true);
    expect(state.registration.available).toBe(false);
    expect(state.registration.placement.pages[0].editorHref).toBeNull();
  });

  it("C06 page participation: accepts same-event enquiries and rejects foreign, club and registration form references", async () => {
    const s = await setup();
    const page = await s.cms.save(
      s.manager,
      save(s.page, formContent(s.enquiry.id)),
    );
    expect(page.draft.data.content[0]).toMatchObject({
      type: "Form",
      props: { formId: s.enquiry.id },
    });
    const registration = await s.forms.createEventForm(
      s.manager,
      s.event().id,
      {
        kind: "registration",
        title: "Booking form",
      },
    );
    const clubForm = await s.forms.create(s.owner, {
      kind: "contact",
      title: "Club contact",
    });
    let foreignEvent = await s.events.create(s.owner, {
      ...eventFields(s.event()),
      title: "Other event",
      managerUserId: s.owner.userId,
    });
    for (const key of ["website", "forms"] as const)
      foreignEvent = await s.modules.change(s.owner, {
        id: foreignEvent.id,
        expectedVersion: foreignEvent.version,
        key,
        operation: "enable",
        confirmed: true,
      });
    const foreignForm = await s.forms.createEventForm(
      s.owner,
      foreignEvent.id,
      {
        kind: "event",
        title: "Other event enquiry",
      },
    );
    for (const form of [foreignForm, clubForm, registration]) {
      await expect(
        s.cms.save(s.manager, save(page, formContent(form.id))),
      ).rejects.toMatchObject({ code: "FORM_SCOPE" });
      expect((await s.cms.detail(s.manager, page.id, "en")).draft.id).toBe(
        page.draft.id,
      );
    }
    const clubPage = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Club page",
      slug: "club-page",
    });
    await expect(
      s.cms.save(s.owner, save(clubPage, formContent(s.enquiry.id))),
    ).rejects.toMatchObject({ code: "FORM_SCOPE" });
    await expect(
      s.cms.save(
        s.owner,
        save(clubPage, {
          root: { props: {} },
          content: [
            {
              type: "EventRegistration",
              props: { id: randomUUID(), version: 1 },
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_SCOPE_REQUIRED" });
    expect((await s.cms.detail(s.owner, clubPage.id, "en")).draft.id).toBe(
      clubPage.draft.id,
    );
  });

  it("C06 registration preview: gives scoped editors only page configuration and keeps manager records private", async () => {
    const s = await setup();
    await s.change("registration", "enable");
    const registrations = new RegistrationService(
      s.db,
      s.authorization,
      new MembershipService(s.db, s.authorization, s.forms),
    );
    const form = await s.forms.createEventForm(s.manager, s.event().id, {
      kind: "registration",
      title: "Synthetic booking preview",
    });
    await s.forms.publish(s.manager, form.id, {
      expectedRevision: form.draftRevision,
    });
    await registrations.configure(s.manager, s.event().id, {
      expectedVersion: 0,
      authority: "native",
      formId: form.id,
      capacity: 20,
      open: true,
      confirmed: true,
    });
    const editor = await s.actor("scoped-registration-preview-editor");
    const unassigned = await s.actor("unassigned-registration-preview-editor");
    await s.db.insert(membership).values(
      [editor, unassigned].map((actor) => ({
        organizationId: s.scope.organizationId,
        userId: actor.userId,
        role: "member" as const,
        status: "approved" as const,
      })),
    );
    await s.events.changeEditor(s.manager, {
      id: s.event().id,
      expectedVersion: s.event().version,
      userId: editor.userId,
      role: "editor",
      operation: "grant",
      confirmed: true,
    });
    expect(await registrations.editorPreview(editor, s.event().id)).toEqual({
      authority: "native",
      formId: form.id,
      open: true,
    });
    await expect(
      registrations.workspace(editor, s.event().id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      registrations.editorPreview(unassigned, s.event().id),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
  });

  it("C06 page participation: requires published enquiries and preserves disabled and private event access gates", async () => {
    const s = await setup();
    let page = await s.cms.save(
      s.manager,
      save(s.page, formContent(s.enquiry.id)),
    );
    await expect(s.cms.publish(s.manager, version(page))).rejects.toMatchObject(
      { code: "FORM_NOT_PUBLISHED" },
    );
    expect(
      (await s.cms.detail(s.manager, page.id, "en")).publishedRevisionId,
    ).toBeNull();
    await s.forms.publish(s.manager, s.enquiry.id, {
      expectedRevision: s.enquiry.draftRevision,
    });
    page = await s.cms.publish(s.manager, version(page));
    await s.website.publication(s.manager, {
      id: s.event().id,
      expectedVersion: s.event().version,
      operation: "publish",
      confirmed: true,
    });
    expect(
      (await s.website.publicPage(s.event().id, "en", "website"))?.page.data
        .content,
    ).toEqual(page.draft.data.content);
    expect((await s.forms.publicForm(s.enquiry.id)).id).toBe(s.enquiry.id);
    await s.change("forms", "disable");
    await expect(s.forms.publicForm(s.enquiry.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await s.cms.detail(s.manager, page.id, "en")).draft.data.content,
    ).toEqual(page.draft.data.content);
    await s.change("forms", "enable");
    expect((await s.forms.publicForm(s.enquiry.id)).id).toBe(s.enquiry.id);
    const privateEvent = await s.events.save(s.manager, {
      ...eventFields(s.event()),
      visibility: "private",
      id: s.event().id,
      expectedVersion: s.event().version,
    });
    await s.website.publication(s.manager, {
      id: privateEvent.id,
      expectedVersion: privateEvent.version,
      operation: "publish",
      confirmed: true,
    });
    expect(
      await s.website.publicPage(privateEvent.id, "en", "website"),
    ).toBeNull();
    await expect(s.forms.publicForm(s.enquiry.id)).rejects.toMatchObject({
      status: 404,
    });
    const outsider = await s.actor("unassigned-page-reader");
    await expect(
      s.forms.publicForm(s.enquiry.id, outsider),
    ).rejects.toMatchObject({ status: 404 });
    expect((await s.forms.publicForm(s.enquiry.id, s.manager)).id).toBe(
      s.enquiry.id,
    );
  });
}
