import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { CmsService } from "../../src/features/cms/CmsService";
import { CmsPartnerUsage } from "../../src/features/cms/CmsPartnerUsage";
import { FormService } from "../../src/features/forms/FormService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { EventPrizeService } from "../../src/features/events/EventPrizeService";
import type { EventModuleKey } from "../../src/features/events/event_modules";
import { MediaService } from "../../src/features/media/MediaService";
import { PartnerService } from "../../src/features/partners/PartnerService";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { contentPublicationOperations } from "../../src/integrations/automation/content_publication_operations";
import type { AutomationContext } from "../../src/integrations/automation/operation";
import type { AutomationPrincipal } from "../../src/integrations/automation/AutomationAccess";
import type { eventWebsiteChecks } from "./event-website-cases";

const eventFields = {
  title: "Synthetic automation publication",
  description: "Publication fixtures only",
  startsAt: "2030-06-12T14:00:00Z",
  endsAt: null,
  timezone: "Europe/Luxembourg",
  venue: "Community room",
  visibility: "public" as const,
};

export function automationContentPublicationChecks(
  get: Parameters<typeof eventWebsiteChecks>[0],
) {
  describe("C14 explicit content publication", () => {
    async function setup() {
      const ctx = get();
      const people = await ctx.club();
      const { db, authorization, events } = ctx;
      const modules = new EventModuleService(db, events);
      const media = new MediaService(
        db,
        authorization,
        new LocalStorageDriver(resolve(".local/test-uploads")),
      );
      const forms = new FormService(db, authorization);
      const cms = new CmsService(
        db,
        authorization,
        media,
        forms,
        events,
        modules,
      );
      const eventWebsite = new EventWebsiteService(
        db,
        authorization,
        events,
        modules,
        cms,
      );
      const partners = new PartnerService(
        db,
        authorization,
        media,
        new CmsPartnerUsage(),
      );
      const eventPrizes = new EventPrizeService(
        db,
        authorization,
        events,
        modules,
        media,
      );
      const event = await events.create(people.owner, {
        ...eventFields,
        managerUserId: people.manager.userId,
      });
      const principal: AutomationPrincipal = {
        actor: people.owner,
        keyId: "publication-domain-fixture",
        organizationId: people.scope.organizationId,
        scopes: ["forms:publish", "events:publish", "directory:publish"],
        sourceOrigins: [],
      };
      // Real domain services/actors; only unused transport dependencies are omitted.
      const context = {
        services: {
          authorization,
          forms,
          cms,
          events,
          eventWebsite,
          partners,
          eventPrizes,
        },
        principal,
      } as unknown as AutomationContext;
      const run = (
        name: string,
        input: unknown,
        replacement: AutomationPrincipal = principal,
      ) => {
        const op = contentPublicationOperations.find(
          (item) => item.name === name,
        )!;
        return op.run({ ...context, principal: replacement }, input);
      };
      const enable = async (key: EventModuleKey) =>
        modules.change(people.owner, {
          id: event.id,
          expectedVersion: (await events.detail(people.owner, event.id))
            .version,
          key,
          operation: "enable",
          confirmed: true,
        });
      return {
        ...ctx,
        ...people,
        modules,
        forms,
        cms,
        media,
        eventWebsite,
        partners,
        eventPrizes,
        principal,
        context,
        event,
        run,
        enable,
      };
    }

    it("publishes only the saved form revision and retains event-scoped publisher checks", async () => {
      const s = await setup();
      const form = await s.forms.create(s.owner, {
        kind: "contact",
        title: "Contact",
      });
      const input = {
        id: form.id,
        expectedRevision: form.draftRevision,
        confirmed: true,
      };
      const result = await s.run("forms_publish", input);
      expect(result).toEqual({
        id: form.id,
        draftRevision: form.draftRevision,
        publishedVersionId: expect.any(String),
        reviewUrl: `/admin/forms/${form.id}`,
      });
      expect(await s.forms.publicForm(form.id)).not.toBeNull();
      await s.forms.save(s.owner, form.id, {
        expectedRevision: form.draftRevision,
        definition: { ...form.draft, title: "Later private edit" },
      });
      await expect(s.run("forms_publish", input)).rejects.toMatchObject({
        code: "FORM_REVISION_CONFLICT",
      });

      await s.enable("website");
      await s.enable("forms");
      const eventForm = await s.forms.createEventForm(s.owner, s.event.id, {
        kind: "event",
        title: "Event enquiries",
      });
      const editor = await s.actor("form-publication-editor");
      await s.db.insert(membership).values({
        organizationId: s.scope.organizationId,
        userId: editor.userId,
        status: "approved",
        role: "editor",
      });
      await s.events.changeEditor(s.owner, {
        id: s.event.id,
        expectedVersion: (await s.events.detail(s.owner, s.event.id)).version,
        userId: editor.userId,
        role: "editor",
        operation: "grant",
        confirmed: true,
      });
      await expect(
        s.run(
          "forms_publish",
          {
            id: eventForm.id,
            expectedRevision: eventForm.draftRevision,
            confirmed: true,
          },
          { ...s.principal, actor: editor },
        ),
      ).rejects.toMatchObject({ code: "EVENT_ACCESS_DENIED" });
      expect(
        (await s.forms.detail(s.owner, eventForm.id)).publishedVersionId,
      ).toBeNull();
    });

    it("requires an already-published event page and rejects stale event publication without publishing dependencies", async () => {
      const s = await setup();
      await s.enable("website");
      const page = await s.cms.create(s.owner, {
        kind: "page",
        locale: "en",
        title: "Event website",
        slug: "website",
        event: { id: s.event.id, moduleKey: "website" },
      });
      const input = {
        id: s.event.id,
        expectedVersion: (await s.events.detail(s.owner, s.event.id)).version,
        confirmed: true,
      };
      await expect(s.run("events_publish", input)).rejects.toMatchObject({
        code: "EVENT_LANDING_REQUIRED",
      });
      expect(
        (await s.cms.detail(s.owner, page.id, "en")).publishedRevisionId,
      ).toBeNull();
      expect((await s.events.detail(s.owner, s.event.id)).published).toBe(
        false,
      );
      await s.cms.publish(s.owner, {
        id: page.id,
        locale: "en",
        expectedRevisionId: page.draft.id,
      });
      expect(await s.run("events_publish", input)).toMatchObject({
        id: s.event.id,
        version: input.expectedVersion + 1,
        published: true,
      });
      await expect(s.run("events_publish", input)).rejects.toMatchObject({
        code: "EVENT_CONFLICT",
      });
      expect(
        await s.eventWebsite.publicPage(s.event.id, "en", "website"),
      ).not.toBeNull();
    });

    it("keeps private directory images blocked until an independent visibility decision and checks profile versions", async () => {
      const s = await setup();
      const image = await s.media.upload(s.owner, {
        filename: "synthetic-directory.png",
        title: "Synthetic logo",
        alt: "A square",
        bytes: await sharp({
          create: { width: 2, height: 2, channels: 3, background: "#123456" },
        })
          .png()
          .toBuffer(),
      });
      const profile = await s.partners.create(s.owner, {
        name: "Synthetic partner",
        category: "partner",
        description: "Local fixture",
        website: "https://example.test",
        logoId: image.id,
      });
      const input = {
        id: profile.id,
        expectedVersion: profile.version,
        confirmed: true,
      };
      await expect(s.run("directory_publish", input)).rejects.toMatchObject({
        code: "MEDIA_NOT_PUBLIC",
      });
      expect((await s.partners.list(s.owner))[0].published).toBeNull();
      expect((await s.media.detail(s.owner, image.id)).visibility).toBe(
        "private",
      );
      await s.media.update(s.owner, {
        id: image.id,
        title: image.title,
        alt: image.alt,
        caption: image.caption,
        collection: image.collection,
        tags: image.tags,
        visibility: "public",
      });
      expect(await s.run("directory_publish", input)).toEqual({
        id: profile.id,
        version: profile.version + 1,
        published: true,
        reviewUrl: "/admin/partners",
      });
      await expect(s.run("directory_publish", input)).rejects.toMatchObject({
        code: "PARTNER_CONFLICT",
      });
    });

    it("publishes a versioned editorial prize with recent authentication without publishing its event", async () => {
      const s = await setup();
      await s.enable("website");
      await s.enable("prizes");
      const saved = await s.eventPrizes.save(s.owner, s.event.id, {
        expectedVersion: 0,
        draft: {
          title: "Synthetic showcase prize",
          description: "Editorial only",
          imageId: null,
          alt: "",
          quantity: 1,
          position: 0,
          partnerId: null,
        },
      });
      const prize = saved.items.find((item) => item.id === saved.savedId)!;
      const input = {
        eventId: s.event.id,
        id: prize.id,
        expectedVersion: prize.version,
        confirmed: true,
      };
      await expect(
        s.run("events_prize_publish", input, {
          ...s.principal,
          actor: {
            ...s.owner,
            authenticatedAt: new Date(Date.now() - 16 * 60_000),
          },
        }),
      ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
      expect(await s.run("events_prize_publish", input)).toEqual({
        id: prize.id,
        eventId: s.event.id,
        version: prize.version + 1,
        published: true,
        reviewUrl: `/admin/events/${s.event.id}?tab=prizes`,
      });
      await expect(s.run("events_prize_publish", input)).rejects.toMatchObject({
        code: "PRIZE_CHANGED",
      });
      expect((await s.events.detail(s.owner, s.event.id)).published).toBe(
        false,
      );
    });

    it("requires an explicit publication grant, confirmed intent and current membership for every publication tool", async () => {
      const s = await setup();
      for (const op of contentPublicationOperations) {
        expect(
          op.input.safeParse({ ...op.example, confirmed: undefined }).success,
        ).toBe(false);
        expect(
          op.input.safeParse({ ...op.example, confirmed: false }).success,
        ).toBe(false);
        expect(
          op.input.safeParse({ ...op.example, operation: "unpublish" }).success,
        ).toBe(false);
        await expect(
          s.run(op.name, op.example, {
            ...s.principal,
            scopes: ["forms:write", "events:write", "directory:write"],
          }),
        ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
        await expect(
          s.run(op.name, op.example, {
            ...s.principal,
            organizationId: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: "AUTOMATION_ORGANIZATION_CHANGED" });
      }
      await s.db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, s.owner.userId));
      for (const op of contentPublicationOperations)
        await expect(s.run(op.name, op.example)).rejects.toMatchObject({
          status: 403,
        });
    });
  });
}
