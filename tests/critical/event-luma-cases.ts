import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { membership } from "../../db/schema/club";
import { cmsSite } from "../../db/schema/cms";
import { lumaEventLink } from "../../db/schema/integrations";
import { eventRegistration } from "../../db/schema/registrations";
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
import { MembershipService } from "../../src/features/members/MembershipService";
import { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { EventTemplateService } from "../../src/features/events/EventTemplateService";
import { EventCancellationService } from "../../src/features/events/EventCancellationService";
import type { EventModuleKey } from "../../src/features/events/event_modules";
import {
  EventLumaLinkService,
  LumaAvailabilityService,
} from "../../src/integrations/luma";
import { lumaEventUrlSchema } from "../../src/integrations/luma/luma_schemas";

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
const url = "https://luma.com/rotapress-synthetic-event";
const fields = {
  title: "Synthetic linked gathering",
  description: "Locally authored description",
  startsAt: "2026-12-15T15:00:00Z",
  endsAt: null,
  timezone: "Europe/Luxembourg",
  venue: "Synthetic venue",
  visibility: "public" as const,
};

export function eventLumaChecks(get: () => Context) {
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
    const availability = new LumaAvailabilityService(db, authorization);
    const links = new EventLumaLinkService(
      db,
      authorization,
      events,
      modules,
      registrations,
      availability,
    );
    const website = new EventWebsiteService(
      db,
      authorization,
      events,
      modules,
      cms,
      links,
    );
    const cancellations = new EventCancellationService(
      db,
      authorization,
      events,
      registrations,
    );
    const input = {
      event: { ...fields, managerUserId: people.manager.userId },
      template: { kind: "preset", id: "simple" },
    };
    const review = await templates.preview(people.owner, input);
    const event = await templates.create(people.owner, {
      ...input,
      reviewToken: review.token,
      requestId: randomUUID(),
      confirmed: true,
    });
    const change = async (
      key: EventModuleKey,
      operation: "enable" | "disable",
      suspendDependents = false,
    ) =>
      modules.change(people.manager, {
        id: event.id,
        expectedVersion: (await events.detail(people.manager, event.id))
          .version,
        key,
        operation,
        suspendDependents,
        confirmed: true,
      });
    const allow = async (enabled: boolean) =>
      availability.configure(people.owner, {
        expectedVersion: (await availability.workspace(people.owner)).version,
        enabled,
        confirmed: true,
      });
    const save = async (next = url) =>
      links.save(people.manager, event.id, {
        expectedVersion: (await links.workspace(people.manager, event.id))
          .version,
        url: next,
      });
    const publication = async (
      operation: "publish" | "unpublish" = "publish",
    ) => {
      const current = await links.workspace(people.manager, event.id);
      return links.publication(people.manager, event.id, {
        expectedVersion: current.version,
        expectedRegistrationVersion: current.registrationVersion,
        operation,
        confirmed: true,
      });
    };
    const publishEvent = async () => {
      const [page] = await cms.eventPages(people.manager, event.id);
      if (!page.publishedRevisionId)
        await cms.publish(people.manager, {
          id: page.id,
          locale: page.locale,
          expectedRevisionId: page.draftRevisionId,
        });
      return website.publication(people.manager, {
        id: event.id,
        expectedVersion: (await events.detail(people.manager, event.id))
          .version,
        operation: "publish",
        confirmed: true,
      });
    };
    return {
      db,
      events,
      actor,
      ...people,
      modules,
      forms,
      registrations,
      cms,
      templates,
      availability,
      links,
      website,
      cancellations,
      event,
      input,
      change,
      allow,
      save,
      publication,
      publishEvent,
    };
  }

  it("C08 validates only Luma event destinations, without executing or fetching input", () => {
    expect(lumaEventUrlSchema.parse(" https://lu.ma/synthetic-event/ ")).toBe(
      "https://lu.ma/synthetic-event",
    );
    expect(lumaEventUrlSchema.parse(url)).toBe(url);
    for (const invalid of [
      "javascript:alert(1)",
      "http://luma.com/event",
      "https://luma.com.evil.test/event",
      "https://luma.com@evil.test/event",
      "https://user:pass@luma.com/event",
      "https://127.0.0.1/event",
      "https://luma.com:444/event",
      "https://luma.com/event?token=synthetic",
      "https://luma.com/event#invite",
      "https://luma.com/join/invite",
      "https://luma.com/embed/event/evt-synthetic",
      "https://luma.com/home",
      "https://luma.com/",
      "<script>synthetic</script>",
      "https://luma.com/a%2fb",
    ]) {
      expect(lumaEventUrlSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("C06/C08 protects link drafts, current permissions and explicit publication while preserving native form dependencies", async () => {
    const s = await setup();
    const noRequests = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        throw new Error("Link mode must never fetch a provider URL");
      });
    try {
      await expect(s.availability.workspace(s.manager)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        s
          .allow(true)
          .then(() =>
            s.availability.configure(s.manager, {
              enabled: false,
              expectedVersion: 1,
              confirmed: true,
            }),
          ),
      ).rejects.toMatchObject({ status: 403 });
      const editor = await s.actor("luma-editor");
      await s.db
        .insert(membership)
        .values({
          organizationId: s.scope.organizationId,
          userId: editor.userId,
          role: "member",
          status: "approved",
        });
      await s.events.changeEditor(s.manager, {
        id: s.event.id,
        expectedVersion: (await s.events.detail(s.manager, s.event.id)).version,
        userId: editor.userId,
        role: "editor",
        operation: "grant",
        confirmed: true,
      });
      const draft = await s.links.save(editor, s.event.id, {
        expectedVersion: 0,
        url,
      });
      const confirm = {
        expectedVersion: draft.version,
        expectedRegistrationVersion: 1,
        operation: "publish",
        confirmed: true,
      };
      await expect(
        s.links.publication(editor, s.event.id, confirm),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        s.links.publication(s.manager, s.event.id, {
          ...confirm,
          confirmed: false,
        }),
      ).rejects.toThrow();
      await expect(s.publication()).rejects.toMatchObject({
        code: "EVENT_MODULE_DISABLED",
      });
      await s.change("registration", "enable");
      await s.allow(false);
      await expect(s.publication()).rejects.toMatchObject({
        code: "LUMA_DISABLED",
      });
      expect(await s.links.publicLink(null, s.event.id)).toBeNull();
      await s.allow(true);
      await s.publication();
      expect(await s.links.publicLink(null, s.event.id)).toBeNull();
      const sharedBefore = await s.db.select().from(cmsSite);
      await s.publishEvent();
      const result = await s.website.publicPage(s.event.id, "en", "website");
      expect(result?.lumaUrl).toBe(url);
      expect(result?.navigation.map((item) => item.key)).toEqual([
        "website",
        "registration",
      ]);
      expect(result?.event.description).toBe(fields.description);
      expect(
        (await s.modules.states(s.scope.organizationId, s.event.id)).find(
          (m) => m.key === "forms",
        )?.state,
      ).toBe("disabled");
      expect(await s.db.select().from(cmsSite)).toEqual(sharedBefore);
      await expect(
        s.registrations.publicForm(null, s.event.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        s.registrations.register(s.owner, s.event.id, {
          versionId: randomUUID(),
          requestId: randomUUID(),
          answers: {},
        }),
      ).rejects.toMatchObject({ status: 404 });
      const changed = await s.save("https://lu.ma/rotapress-synthetic-other");
      expect((await s.links.workspace(editor, s.event.id)).draftUrl).toBe(
        changed.draftUrl,
      );
      expect(await s.links.publicLink(null, s.event.id)).toBe(url);
      await expect(s.publication()).rejects.toMatchObject({
        code: "LUMA_EVENT_LOCKED",
      });
      await expect(
        s.links.save(s.manager, s.event.id, { expectedVersion: 1, url }),
      ).rejects.toMatchObject({ code: "LUMA_LINK_CHANGED" });
      const other = await s.events.create(s.owner, {
        ...fields,
        managerUserId: s.owner.userId,
      });
      await expect(
        s.links.workspace(s.manager, other.id),
      ).rejects.toMatchObject({ status: 404 });
      await s.db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, editor.userId));
      await expect(s.links.workspace(editor, s.event.id)).rejects.toMatchObject(
        { status: 403 },
      );
      expect(noRequests).not.toHaveBeenCalled();
    } finally {
      noRequests.mockRestore();
    }
  });

  it("C07/C08 refuses authority changes with retained native bookings and never leaves a partial publication", async () => {
    const s = await setup();
    await s.change("forms", "enable");
    await s.change("registration", "enable");
    const draft = await s.forms.createEventForm(s.manager, s.event.id, {
      kind: "registration",
      title: "Synthetic native booking",
    });
    const form = await s.forms.publish(s.manager, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    const settings = await s.registrations.workspace(s.manager, s.event.id);
    await s.registrations.configure(s.manager, s.event.id, {
      expectedVersion: settings.version,
      authority: "native",
      formId: form.id,
      capacity: 1,
      open: true,
      confirmed: true,
    });
    await s.publishEvent();
    const guest = await s.actor("luma-native-history");
    const booking = await s.registrations.register(guest, s.event.id, {
      versionId: form.publishedVersionId,
      requestId: randomUUID(),
      answers: { name: "Synthetic native guest" },
    });
    await s.registrations.cancel(guest, booking.registration.id, {
      confirmed: true,
    });
    await s.save();
    await s.allow(true);
    const before = await s.registrations.workspace(s.manager, s.event.id);
    await expect(s.publication()).rejects.toMatchObject({
      code: "REGISTRATION_AUTHORITY_LOCKED",
    });
    expect(await s.registrations.workspace(s.manager, s.event.id)).toEqual(
      before,
    );
    expect((await s.links.workspace(s.manager, s.event.id)).published).toBe(
      false,
    );
    expect(await s.db.select().from(eventRegistration)).toHaveLength(1);
    await expect(s.change("forms", "disable")).rejects.toMatchObject({
      code: "EVENT_DEPENDENTS_ACTIVE",
    });
    await s.change("forms", "disable", true);
    await expect(
      s.modules.requireEnabled(
        s.scope.organizationId,
        s.event.id,
        "registration",
      ),
    ).rejects.toMatchObject({ code: "EVENT_MODULE_DISABLED" });
  });

  it("C06/C08 hides links immediately on disable, unpublication, privacy and cancellation, while copies exclude provider linkage", async () => {
    const s = await setup();
    await s.change("registration", "enable");
    await s.save();
    await s.allow(true);
    await s.publication();
    await s.publishEvent();
    const sourcePages = await s.cms.eventPages(s.owner, s.event.id);
    await s.change("forms", "enable");
    await s.change("forms", "disable");
    expect(await s.links.publicLink(null, s.event.id)).toBe(url);
    await s.allow(false);
    expect(await s.links.publicLink(null, s.event.id)).toBeNull();
    expect(
      (await s.website.publicPage(s.event.id, "en", "website"))?.navigation.map(
        (n) => n.key,
      ),
    ).toEqual(["website"]);
    expect((await s.links.workspace(s.manager, s.event.id)).publishedUrl).toBe(
      url,
    );
    await s.allow(true);
    expect(await s.links.publicLink(null, s.event.id)).toBe(url);
    await s.publication("unpublish");
    expect(await s.links.publicLink(null, s.event.id)).toBeNull();
    await expect(
      s.registrations.configure(s.manager, s.event.id, {
        expectedVersion: (
          await s.registrations.workspace(s.manager, s.event.id)
        ).version,
        authority: "none",
        formId: null,
        capacity: null,
        open: false,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "REGISTRATION_AUTHORITY_LOCKED" });
    await s.publication();
    await s.change("registration", "disable");
    expect(await s.links.publicLink(null, s.event.id)).toBeNull();
    await s.change("registration", "enable");
    const edit = await s.events.detail(s.manager, s.event.id);
    await s.events.save(s.manager, {
      id: edit.id,
      expectedVersion: edit.version,
      ...fields,
      visibility: "private",
    });
    expect(await s.links.publicLink(null, s.event.id)).toBe(url);
    await s.publishEvent();
    expect(await s.links.publicLink(null, s.event.id)).toBeNull();
    expect(await s.links.publicLink(s.manager, s.event.id)).toBe(url);
    const copyInput = {
      ...s.input,
      template: { kind: "copy", id: s.event.id },
    };
    const review = await s.templates.preview(s.owner, copyInput);
    expect(review.registration.authority).toBe("none");
    const copy = await s.templates.create(s.owner, {
      ...copyInput,
      reviewToken: review.token,
      requestId: randomUUID(),
      confirmed: true,
    });
    expect(await s.registrations.workspace(s.owner, copy.id)).toMatchObject({
      authority: "none",
      open: false,
      externalLocked: false,
    });
    expect((await s.links.workspace(s.owner, copy.id)).draftUrl).toBe("");
    expect(await s.db.select().from(lumaEventLink)).toHaveLength(1);
    expect(await s.cms.eventPages(s.owner, s.event.id)).toEqual(sourcePages);
    const impact = await s.cancellations.preview(s.manager, s.event.id);
    expect(impact.externalAuthority).toBe(true);
    await s.cancellations.cancel(s.manager, {
      id: s.event.id,
      expectedVersion: impact.expectedVersion,
      expectedConfirmed: impact.expectedConfirmed,
      confirmed: true,
    });
    expect(await s.links.publicLink(s.manager, s.event.id)).toBeNull();
    await expect(s.publication()).rejects.toMatchObject({
      code: "EVENT_CANCELLED",
    });
    expect((await s.links.workspace(s.manager, s.event.id)).publishedUrl).toBe(
      url,
    );
  });
}
