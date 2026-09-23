import { randomUUID } from "node:crypto";
import { referenceEventPage } from "../../src/features/events/event_page_template";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { clubEvent, eventManager } from "../../db/schema/events";
import {
  cmsContent,
  cmsRevision,
  cmsSite,
  cmsVariant,
} from "../../db/schema/cms";
import { formNotification, formSubmission } from "../../db/schema/forms";
import { eventRegistration } from "../../db/schema/registrations";
import { guestAccess } from "../../db/schema/guest-access";
import { GuestAccessService } from "../../src/features/guests/GuestAccessService";
import { LumaGuestAccessSource } from "../../src/integrations/luma/LumaGuestAccessSource";
import { membership } from "../../db/schema/club";
import type {
  AuthorizationService,
  TrustedActor,
  StaffAccess,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { MediaService } from "../../src/features/media/MediaService";
import { CmsService } from "../../src/features/cms/CmsService";
import { CmsEventCopyService } from "../../src/features/cms/CmsEventCopyService";
import { FormEventCopyService } from "../../src/features/forms/FormEventCopyService";
import { FormService } from "../../src/features/forms/FormService";
import { SubmissionService } from "../../src/features/forms/SubmissionService";
import { FormNotificationRunner } from "../../src/features/forms/FormNotificationRunner";
import { MembershipService } from "../../src/features/members/MembershipService";
import { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { EventTemplateService } from "../../src/features/events/EventTemplateService";
import { EventCancellationService } from "../../src/features/events/EventCancellationService";
import {
  eventPresets,
  type EventTemplateSelection,
} from "../../src/features/events/event_templates";
import { defaultEventDesign } from "../../src/features/events/event_design";
import type { EventModuleKey } from "../../src/features/events/event_modules";

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
  title: "Synthetic new gathering",
  description: "Event description",
  startsAt: "2026-12-10T15:00:00Z",
  endsAt: null,
  timezone: "Europe/Luxembourg",
  venue: "Synthetic venue",
  visibility: "public" as const,
};

export function eventTemplateChecks(get: () => Context) {
  async function setup() {
    const { db, authorization, events, club, actor } = get();
    const people = await club();
    const media = new MediaService(
      db,
      authorization,
      new LocalStorageDriver(resolve(".local/test-uploads")),
    );
    const modules = new EventModuleService(db, events);
    const forms = new FormService(db, authorization);
    const members = new MembershipService(db, authorization, forms);
    const registrations = new RegistrationService(db, authorization, members);
    const cms = new CmsService(
      db,
      authorization,
      media,
      forms,
      events,
      modules,
    );
    const formCopies = new FormEventCopyService();
    const templates = new EventTemplateService(
      db,
      authorization,
      events,
      modules,
      new CmsEventCopyService(db, authorization, media, events, modules),
      formCopies,
      registrations,
      media,
    );
    const website = new EventWebsiteService(
      db,
      authorization,
      events,
      modules,
      cms,
    );
    const cancellations = new EventCancellationService(
      db,
      authorization,
      events,
      registrations,
    );
    const submissions = new SubmissionService(db, authorization, members);
    const input = (
      template: EventTemplateSelection = { kind: "preset", id: "networking" },
    ) => ({
      event: { ...fields, managerUserId: people.manager.userId },
      template,
    });
    const create = async (template?: EventTemplateSelection) => {
      const value = input(template);
      const review = await templates.preview(people.owner, value);
      return templates.create(people.owner, {
        ...value,
        reviewToken: review.token,
        confirmed: true,
        requestId: randomUUID(),
      });
    };
    const publish = async (eventId: string) => {
      const [page] = await cms.eventPages(people.manager, eventId);
      await cms.publish(people.manager, {
        id: page.id,
        locale: page.locale,
        expectedRevisionId: page.draftRevisionId,
      });
      const draft = (await forms.eventForms(people.manager, eventId)).find(
        (f) => f.kind === "registration",
      )!;
      const publishedForm = await forms.publish(people.manager, draft.id, {
        expectedRevision: draft.draftRevision,
      });
      const settings = await registrations.workspace(people.manager, eventId);
      await registrations.configure(people.manager, eventId, {
        expectedVersion: settings.version,
        authority: "native",
        formId: draft.id,
        capacity: 5,
        open: true,
        confirmed: true,
      });
      const event = await events.detail(people.manager, eventId);
      await website.publication(people.manager, {
        id: eventId,
        expectedVersion: event.version,
        operation: "publish",
        confirmed: true,
      });
      return publishedForm;
    };
    return {
      ...people,
      actor,
      db,
      authorization,
      events,
      modules,
      forms,
      registrations,
      cms,
      templates,
      website,
      cancellations,
      submissions,
      input,
      create,
      publish,
      formCopies,
    };
  }

  it("C06 creates reviewed preset drafts atomically and never activates through appearance or replay", async () => {
    const s = await setup();
    for (const id of ["simple", "networking", "fundraiser"] as const) {
      const input = s.input({ kind: "preset", id });
      const before = await s.events.list(s.owner);
      const review = await s.templates.preview(s.owner, input);
      expect(await s.events.list(s.owner)).toEqual(before);
      const values = {
        ...input,
        reviewToken: review.token,
        requestId: randomUUID(),
        confirmed: true,
      };
      await expect(
        s.templates.create(s.owner, { ...values, confirmed: false }),
      ).rejects.toThrow();
      const event = await s.templates.create(s.owner, values);
      expect(event.published).toBe(false);
      expect((await s.templates.create(s.owner, values)).id).toBe(event.id);
      await expect(
        s.templates.create(s.owner, {
          ...values,
          event: { ...input.event, title: "Changed request" },
        }),
      ).rejects.toMatchObject({ code: "EVENT_CREATION_REPLAY_CONFLICT" });
      const states = await s.modules.states(s.scope.organizationId, event.id);
      expect(
        states.filter((m) => m.state === "enabled").map((m) => m.key),
      ).toEqual(eventPresets[id].features);
      expect(
        (await s.cms.eventPages(s.owner, event.id)).every(
          (p) => p.publishedRevisionId === null,
        ),
      ).toBe(true);
      expect(
        (await s.forms.eventForms(s.owner, event.id)).every(
          (f) => !f.publishedVersionId && f.draftRevision === 1,
        ),
      ).toBe(true);
      expect((await s.registrations.workspace(s.owner, event.id)).open).toBe(
        false,
      );
      expect(await s.website.publicPage(event.id, "en", "website")).toBeNull();
    }
    await expect(
      s.templates.preview(s.manager, s.input()),
    ).rejects.toMatchObject({ status: 403 });
    const input = s.input(),
      review = await s.templates.preview(s.owner, input);
    const before = await s.db.select().from(clubEvent);
    vi.spyOn(s.formCopies, "createDrafts").mockRejectedValueOnce(
      new Error("Synthetic failure while copying forms"),
    );
    await expect(
      s.templates.create(s.owner, {
        ...input,
        reviewToken: review.token,
        requestId: randomUUID(),
        confirmed: true,
      }),
    ).rejects.toThrow("Synthetic failure");
    expect(await s.db.select().from(clubEvent)).toEqual(before);
    expect(await s.db.select().from(cmsContent)).toHaveLength(5);
  });

  it("C06 creates only reviewed selected features with dependency checks and standalone page defaults", async () => {
    const s = await setup();
    for (const selectedModules of [
      ["gallery"],
      ["website", "registration"],
      ["website", "website"],
      ["unknown"],
    ]) {
      await expect(
        s.templates.preview(s.owner, {
          ...s.input(),
          template: { kind: "preset", id: "simple", selectedModules },
        }),
      ).rejects.toThrow();
    }
    expect(await s.events.list(s.owner)).toHaveLength(0);
    const changed = s.input({
      kind: "preset",
      id: "simple",
      selectedModules: ["website", "gallery"],
    });
    const review = await s.templates.preview(s.owner, changed);
    await expect(
      s.templates.create(s.owner, {
        ...changed,
        template: {
          kind: "preset",
          id: "simple",
          selectedModules: ["website"],
        },
        reviewToken: review.token,
        requestId: randomUUID(),
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "EVENT_TEMPLATE_REVIEW_CHANGED" });
    expect(await s.events.list(s.owner)).toHaveLength(0);
    const selections: EventModuleKey[][] = [
      [],
      ["website", "gallery"],
      ["website", "forms"],
      ["website", "forms", "registration"],
    ];
    for (const selectedModules of selections) {
      const event = await s.create({
        kind: "preset",
        id: "fundraiser",
        selectedModules,
      });
      expect(
        (await s.modules.states(s.scope.organizationId, event.id))
          .filter((module) => module.state === "enabled")
          .map((module) => module.key),
      ).toEqual(selectedModules);
      const pages = await s.cms.eventPages(s.owner, event.id);
      expect(pages.map((page) => page.moduleKey).sort()).toEqual(
        selectedModules
          .filter((key) => ["website", "gallery", "sponsors"].includes(key))
          .sort(),
      );
      const forms = await s.forms.eventForms(s.owner, event.id);
      for (const page of pages) {
        const detail = await s.cms.detail(s.owner, page.id, page.locale);
        expect(detail.draft.data.root.props).toMatchObject({
          eventLayout: "standalone",
          eventDesign:
            page.moduleKey === "website"
              ? referenceEventPage().root.props.eventDesign
              : defaultEventDesign,
        });
        expect(detail.publishedRevisionId).toBeNull();
        const participation = detail.draft.data.content.filter(
          (block) =>
            block.type === "Form" || block.type === "EventRegistration",
        );
        expect(participation.map((block) => block.type)).toEqual(
          page.moduleKey !== "website"
            ? []
            : selectedModules.includes("registration")
              ? ["EventRegistration"]
              : selectedModules.includes("forms")
                ? ["Form"]
                : [],
        );
        if (participation[0]?.type === "Form") {
          expect(participation[0].props.formId).toBe(forms[0].id);
          expect(forms[0].event?.id).toBe(event.id);
          await expect(
            s.cms.publish(s.owner, {
              id: page.id,
              locale: page.locale,
              expectedRevisionId: detail.draft.id,
            }),
          ).rejects.toMatchObject({ code: "FORM_NOT_PUBLISHED" });
        }
      }
      expect(forms.every((form) => form.publishedVersionId === null)).toBe(
        true,
      );
      expect(forms.map((form) => form.kind)).toEqual(
        selectedModules.includes("registration")
          ? ["registration"]
          : selectedModules.includes("forms")
            ? ["event"]
            : [],
      );
      expect(await s.registrations.workspace(s.owner, event.id)).toMatchObject({
        authority: selectedModules.includes("registration") ? "native" : "none",
        formId: selectedModules.includes("registration") ? forms[0].id : null,
        open: false,
      });
      expect(await s.website.publicPage(event.id, "en", "website")).toBeNull();
      await expect(
        s.templates.preview(s.owner, {
          ...s.input(),
          template: { kind: "copy", id: event.id, selectedModules: [] },
        }),
      ).rejects.toThrow();
    }
    const direct = await s.events.create(s.owner, {
      ...fields,
      managerUserId: s.manager.userId,
    });
    await s.modules.change(s.manager, {
      id: direct.id,
      expectedVersion: direct.version,
      key: "website",
      operation: "enable",
      confirmed: true,
    });
    const newPage = await s.cms.create(s.manager, {
      kind: "page",
      locale: "en",
      title: "New event page",
      slug: "website",
      event: { id: direct.id, moduleKey: "website" },
    });
    const newLocale = await s.cms.addLocale(s.manager, {
      id: newPage.id,
      locale: "fr",
      title: "New language",
      slug: "website",
    });
    for (const page of [newPage, newLocale])
      expect(page.draft.data.root.props).toMatchObject({
        eventLayout: "standalone",
        eventDesign: defaultEventDesign,
      });
  });

  it("C06 copies draft content and closed configuration without identities, responses, publication or shared appearance changes", async () => {
    const s = await setup();
    const source = await s.create();
    const publishedForm = await s.publish(source.id);
    await s.forms.updateSettings(s.manager, publishedForm.id, {
      recipients: ["synthetic-team@example.test"],
      retentionDays: null,
    });
    const guest = await s.actor("copy-excluded-guest");
    const booking = await s.registrations.register(guest, source.id, {
      versionId: publishedForm.publishedVersionId,
      requestId: randomUUID(),
      answers: { name: "Synthetic guest" },
    });
    await s.modules.change(s.manager, {
      id: source.id,
      expectedVersion: (await s.events.detail(s.manager, source.id)).version,
      key: "portal",
      operation: "enable",
      confirmed: true,
    });
    const guests = new GuestAccessService(
      s.db,
      s.events,
      s.modules,
      s.registrations,
      new LumaGuestAccessSource(),
    );
    await guests.grant(s.manager, source.id, {
      source: "native",
      sourceId: booking.registration.id,
      confirmed: true,
    });
    const site = await s.cms.getSite(s.owner, "en");
    await s.cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: { ...site.draft, footerText: "Preserved club footer" },
    });
    const sharedBefore = await s.db.select().from(cmsSite);
    const [page] = await s.cms.eventPages(s.manager, source.id);
    const variant = await s.cms.addLocale(s.manager, {
      id: page.id,
      locale: "fr",
      title: "Texte du club",
      slug: "website-fr",
    });
    const copyInput = s.input({ kind: "copy", id: source.id });
    const review = await s.templates.preview(s.owner, copyInput);
    await s.cms.save(s.manager, {
      id: variant.id,
      locale: "fr",
      expectedRevisionId: variant.draft.id,
      title: "Updated French draft",
      slug: variant.draft.slug,
      description: "",
      socialImageId: null,
      data: variant.draft.data,
    });
    await expect(
      s.templates.create(s.owner, {
        ...copyInput,
        reviewToken: review.token,
        requestId: randomUUID(),
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "EVENT_TEMPLATE_REVIEW_CHANGED" });
    const copy = await s.create({ kind: "copy", id: source.id });
    expect(await s.db.select().from(guestAccess)).toHaveLength(1);
    expect((await guests.workspace(s.owner, copy.id)).grants).toEqual([]);
    const copiedPages = await s.cms.eventPages(s.owner, copy.id);
    expect(copiedPages).toHaveLength(2);
    expect(copiedPages.map((p) => p.id)).not.toContain(page.id);
    expect(copiedPages.every((p) => p.publishedRevisionId === null)).toBe(true);
    for (const copied of copiedPages) {
      const original = await s.cms.detail(s.owner, page.id, copied.locale);
      const detail = await s.cms.detail(s.owner, copied.id, copied.locale);
      expect(detail.draft.data).toEqual(original.draft.data);
      expect(detail.revisions).toHaveLength(1);
    }
    const [copiedForm] = await s.forms.eventForms(s.owner, copy.id);
    expect(copiedForm.id).not.toBe(publishedForm.id);
    expect(copiedForm.draft).toEqual(publishedForm.draft);
    expect(copiedForm.publishedVersionId).toBeNull();
    expect(await s.forms.settings(s.owner, copiedForm.id)).toEqual({
      recipients: [],
      retentionDays: null,
    });
    expect(await s.registrations.workspace(s.owner, copy.id)).toMatchObject({
      authority: "native",
      formId: copiedForm.id,
      capacity: 5,
      open: false,
      confirmedCount: 0,
    });
    expect(await s.db.select().from(eventRegistration)).toHaveLength(1);
    expect(await s.db.select().from(formSubmission)).toHaveLength(1);
    expect(await s.db.select().from(formNotification)).toHaveLength(1);
    expect(
      await s.db
        .select()
        .from(eventManager)
        .where(eq(eventManager.eventId, copy.id)),
    ).toHaveLength(1);
    expect(await s.db.select().from(cmsSite)).toEqual(sharedBefore);
    expect(
      (await s.registrations.workspace(s.owner, source.id)).confirmedCount,
    ).toBe(1);
    expect(
      (await s.website.publicPage(source.id, "en", "website"))?.event.title,
    ).toBe(fields.title);
    expect(await s.website.publicPage(copy.id, "en", "website")).toBeNull();
  });

  it("C06 copies embedded enquiry references to new event forms and preserves the page layout", async () => {
    const s = await setup();
    const source = await s.create({ kind: "preset", id: "fundraiser" });
    const sourcePage = (await s.cms.eventPages(s.manager, source.id)).find(
      (page) => page.moduleKey === "website",
    )!;
    let original = await s.cms.detail(s.manager, sourcePage.id, "en");
    const [sourceForm] = await s.forms.eventForms(s.manager, source.id);
    original = await s.cms.save(s.manager, {
      id: original.id,
      locale: original.locale,
      expectedRevisionId: original.draft.id,
      title: original.draft.title,
      slug: original.draft.slug,
      description: original.draft.description,
      socialImageId: original.draft.socialImageId,
      data: {
        root: { props: { eventLayout: "standalone" } },
        content: [
          {
            type: "Form",
            props: { id: randomUUID(), version: 1, formId: sourceForm.id },
          },
        ],
      },
    });
    await s.forms.publish(s.manager, sourceForm.id, {
      expectedRevision: sourceForm.draftRevision,
    });
    const copy = await s.create({ kind: "copy", id: source.id });
    const copiedPage = (await s.cms.eventPages(s.owner, copy.id)).find(
      (page) => page.moduleKey === "website",
    )!;
    const detail = await s.cms.detail(s.owner, copiedPage.id, "en");
    const [copiedForm] = await s.forms.eventForms(s.owner, copy.id);
    expect(copiedForm.id).not.toBe(sourceForm.id);
    expect(copiedForm.event?.id).toBe(copy.id);
    expect(copiedForm.publishedVersionId).toBeNull();
    expect(detail.draft.data.root.props.eventLayout).toBe("standalone");
    expect(detail.draft.data.content).toEqual([
      {
        ...original.draft.data.content[0],
        props: {
          ...original.draft.data.content[0].props,
          formId: copiedForm.id,
        },
      },
    ]);
    expect(detail.publishedRevisionId).toBeNull();
    expect((await s.cms.detail(s.owner, original.id, "en")).draft.data).toEqual(
      original.draft.data,
    );
    const publication = {
      id: detail.id,
      locale: detail.locale,
      expectedRevisionId: detail.draft.id,
    };
    await expect(s.cms.publish(s.owner, publication)).rejects.toMatchObject({
      code: "FORM_NOT_PUBLISHED",
    });
    await s.forms.publish(s.owner, copiedForm.id, {
      expectedRevision: copiedForm.draftRevision,
    });
    expect(
      (await s.cms.publish(s.owner, publication)).publishedRevisionId,
    ).toBe(detail.draft.id);
    expect(await s.website.publicPage(copy.id, "en", "website")).toBeNull();
  });

  it("C06 refuses unsupported copied blocks instead of dropping them", async () => {
    const s = await setup();
    const source = await s.create({ kind: "preset", id: "simple" });
    const [page] = await s.cms.eventPages(s.owner, source.id);
    const [variant] = await s.db
      .select()
      .from(cmsVariant)
      .where(eq(cmsVariant.contentId, page.id));
    // Deliberately malformed storage fixture; runtime service input rejects this.
    const [revision] = await s.db
      .insert(cmsRevision)
      .values({
        variantId: variant.id,
        createdBy: s.owner.userId,
        title: "Unknown block",
        slug: "website",
        data: {
          root: { props: {} },
          content: [
            {
              type: "FutureUnknownBlock",
              props: { id: "unknown", version: 99 },
            },
          ],
        },
      })
      .returning();
    await s.db
      .update(cmsVariant)
      .set({ draftRevisionId: revision.id })
      .where(eq(cmsVariant.id, variant.id));
    await expect(
      s.templates.preview(s.owner, s.input({ kind: "copy", id: source.id })),
    ).rejects.toThrow();
    expect(await s.events.list(s.owner)).toHaveLength(1);
    expect(
      (
        await s.db
          .select()
          .from(cmsRevision)
          .where(eq(cmsRevision.id, revision.id))
      )[0].data,
    ).toEqual(revision.data);
  });

  it("C06/C07 reviews cancellation impact, stops new participation and notifications, and retains scoped history", async () => {
    const s = await setup(),
      event = await s.create(),
      form = await s.publish(event.id);
    await s.forms.updateSettings(s.manager, form.id, {
      recipients: ["synthetic-reviewer@example.test"],
      retentionDays: null,
    });
    const guest = await s.actor("cancel-guest"),
      second = await s.actor("cancel-new-guest");
    const input = () => ({
      versionId: form.publishedVersionId,
      requestId: randomUUID(),
      answers: { name: "Synthetic cancellation guest" },
    });
    const receipt = await s.registrations.register(guest, event.id, input());
    const before = await s.cancellations.preview(s.manager, event.id);
    await s.registrations.register(second, event.id, input());
    await expect(
      s.cancellations.cancel(s.manager, {
        id: event.id,
        expectedVersion: before.expectedVersion,
        expectedConfirmed: before.expectedConfirmed,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "CANCELLATION_REVIEW_CHANGED" });
    const review = await s.cancellations.preview(s.manager, event.id);
    const values = {
      id: event.id,
      expectedVersion: review.expectedVersion,
      expectedConfirmed: review.expectedConfirmed,
      confirmed: true,
    };
    await expect(
      s.cancellations.cancel(s.manager, { ...values, confirmed: false }),
    ).rejects.toThrow();
    const outsider = await s.actor("cancel-editor");
    await s.db.insert(membership).values({
      organizationId: s.scope.organizationId,
      userId: outsider.userId,
      role: "member",
      status: "approved",
    });
    await s.events.changeEditor(s.manager, {
      id: event.id,
      expectedVersion: review.expectedVersion,
      userId: outsider.userId,
      role: "registration-manager",
      operation: "grant",
      confirmed: true,
    });
    await expect(
      s.cancellations.preview(outsider, event.id),
    ).rejects.toMatchObject({ status: 403 });
    values.expectedVersion = (
      await s.events.detail(s.manager, event.id)
    ).version;
    const cancelled = await s.cancellations.cancel(s.manager, values);
    expect(cancelled.cancelled).toBe(true);
    expect((await s.cancellations.cancel(s.manager, values)).version).toBe(
      cancelled.version,
    );
    expect((await s.registrations.mine(guest))[0].status).toBe("cancelled");
    expect(await s.registrations.workspace(s.manager, event.id)).toMatchObject({
      open: false,
      confirmedCount: 0,
    });
    expect((await s.submissions.detail(s.manager, receipt.id)).id).toBe(
      receipt.id,
    );
    await expect(
      s.registrations.register(guest, event.id, input()),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      s.registrations.publicForm(guest, event.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      s.forms.createEventForm(s.manager, event.id, {
        kind: "event",
        title: "Must not create",
      }),
    ).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
    await expect(
      s.cms.create(s.manager, {
        kind: "page",
        locale: "en",
        title: "Must not create",
        slug: "gallery",
        event: { id: event.id, moduleKey: "gallery" },
      }),
    ).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
    await expect(
      s.modules.change(s.manager, {
        id: event.id,
        expectedVersion: cancelled.version,
        key: "forms",
        operation: "enable",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
    const publicPage = await s.website.publicPage(event.id, "en", "website");
    expect(publicPage?.cancelled).toBe(true);
    expect(publicPage?.navigation.map((n) => n.key)).toEqual(["website"]);
    const sendSubmissionNotification = vi.fn();
    expect(
      (
        await new FormNotificationRunner(
          s.db,
          { sendSubmissionNotification },
          "http://127.0.0.1:4100",
        ).runBatch()
      ).processed,
    ).toBe(0);
    expect(sendSubmissionNotification).not.toHaveBeenCalled();
    const copy = await s.create({ kind: "copy", id: event.id });
    expect(copy.cancelled).toBe(false);
    await s.events.archive(s.manager, {
      id: event.id,
      expectedVersion: cancelled.version,
    });
    expect(await s.website.publicPage(event.id, "en", "website")).toBeNull();
    expect(await s.db.select().from(formSubmission)).toHaveLength(2);
    expect(await s.db.select().from(formNotification)).toHaveLength(2);
  });
}
