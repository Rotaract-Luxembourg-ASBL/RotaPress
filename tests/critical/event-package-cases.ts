import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { membership } from "../../db/schema/club";
import {
  eventPackage,
  eventPackageRevision,
  eventPackageSource,
} from "../../db/schema/event-packages";
import { CmsService } from "../../src/features/cms/CmsService";
import { CmsEventCopyService } from "../../src/features/cms/CmsEventCopyService";
import { FormService } from "../../src/features/forms/FormService";
import { FormEventCopyService } from "../../src/features/forms/FormEventCopyService";
import { MediaService } from "../../src/features/media/MediaService";
import { MembershipService } from "../../src/features/members/MembershipService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventPackageService } from "../../src/features/events/EventPackageService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { EventCancellationService } from "../../src/features/events/EventCancellationService";
import { EventTemplateService } from "../../src/features/events/EventTemplateService";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import { eventFields } from "../../src/features/events/event_schemas";
import type { EventModuleKey } from "../../src/features/events/event_modules";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import {
  EventLumaLinkService,
  LumaAvailabilityService,
} from "../../src/integrations/luma";
import type { eventWebsiteChecks } from "./event-website-cases";

const sourceUrl = "https://luma.com/synthetic-package-checkout";
const fields = {
  title: "Synthetic package event",
  description: "Locally authored package event",
  startsAt: "2030-06-12T14:00:00Z",
  endsAt: null,
  timezone: "Europe/Luxembourg",
  venue: "Example community room",
  visibility: "public" as const,
};
const draft = {
  title: "Synthetic dinner package",
  description: "Authored description, not a payment entitlement",
  priceMinor: 2500,
  currency: "EUR" as const,
  showPrice: false,
  checkoutEnabled: false,
  position: 0,
};

export function eventPackageChecks(
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
    const availability = new LumaAvailabilityService(db, authorization);
    const links = new EventLumaLinkService(
      db,
      authorization,
      events,
      modules,
      registrations,
      availability,
    );
    const packages = new EventPackageService(
      db,
      authorization,
      events,
      modules,
      registrations,
      links,
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
        expectedVersion: (await events.detail(people.manager, event.id))
          .version,
        key,
        operation,
        suspendDependents: key === "website" && operation === "disable",
        confirmed: true,
      });
    }
    await change("website", "enable");
    const page = await cms.create(people.manager, {
      kind: "page",
      locale: "en",
      title: "Synthetic packages",
      slug: "website",
      event: { id: event.id, moduleKey: "website" },
    });
    await cms.publish(people.manager, {
      id: page.id,
      locale: page.locale,
      expectedRevisionId: page.draft.id,
    });
    const publishEvent = () =>
      events.detail(people.manager, event.id).then((current) =>
        website.publication(people.manager, {
          id: event.id,
          expectedVersion: current.version,
          operation: "publish",
          confirmed: true,
        }),
      );
    const allow = async (enabled: boolean) =>
      availability.configure(people.owner, {
        expectedVersion: (await availability.workspace(people.owner)).version,
        enabled,
        confirmed: true,
      });
    const publishLink = async (
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
    async function activateCheckout() {
      await change("registration", "enable");
      await allow(true);
      await links.save(people.manager, event.id, {
        expectedVersion: 0,
        url: sourceUrl,
      });
      await publishLink();
    }
    const current = async (id: string) => {
      const row = (
        await packages.workspace(people.manager, event.id)
      ).packages.find((item) => item.id === id);
      if (!row) throw new Error("Synthetic package fixture is missing.");
      return row;
    };
    return {
      ...people,
      db,
      actor,
      events,
      packages,
      modules,
      templates,
      event,
      links,
      registrations,
      cancellations,
      change,
      allow,
      publishEvent,
      publishLink,
      activateCheckout,
      current,
    };
  }

  it("C06/C08 packages: keeps drafts private and prices explicit while publication retains immutable reviewed content", async () => {
    const s = await setup();
    let workspace = await s.packages.save(s.manager, s.event.id, {
      expectedVersion: 0,
      sourceId: null,
      draft,
    });
    let item = workspace.packages[0];
    expect(item.published).toBeNull();
    expect(await s.packages.published(null, s.event.id)).toEqual([]);
    await s.publishEvent();
    expect(await s.packages.published(null, s.event.id)).toEqual([]);
    workspace = await s.packages.publication(s.manager, s.event.id, item.id, {
      expectedVersion: item.version,
      operation: "publish",
      confirmed: true,
    });
    item = workspace.packages[0];
    const firstPublication = (await s.packages.published(null, s.event.id))[0];
    expect(firstPublication).toMatchObject({
      title: draft.title,
      priceMinor: null,
      currency: null,
      checkoutUrl: null,
    });
    const changedDraft = {
      ...draft,
      title: "Private next package",
      priceMinor: 4200,
      showPrice: true,
    };
    const stale = {
      id: item.id,
      expectedVersion: item.version,
      sourceId: null,
      draft: changedDraft,
    };
    workspace = await s.packages.save(s.manager, s.event.id, stale);
    item = workspace.packages[0];
    expect(await s.packages.published(null, s.event.id)).toEqual([
      firstPublication,
    ]);
    await expect(
      s.packages.save(s.manager, s.event.id, stale),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.packages.publication(s.manager, s.event.id, item.id, {
        expectedVersion: stale.expectedVersion,
        operation: "publish",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.packages.publication(s.manager, s.event.id, item.id, {
        expectedVersion: item.version,
        operation: "publish",
        confirmed: false,
      }),
    ).rejects.toThrow();
    workspace = await s.packages.publication(s.manager, s.event.id, item.id, {
      expectedVersion: item.version,
      operation: "publish",
      confirmed: true,
    });
    item = workspace.packages[0];
    const secondPublication = (await s.packages.published(null, s.event.id))[0];
    expect(secondPublication).toMatchObject({
      title: changedDraft.title,
      priceMinor: 4200,
      currency: "EUR",
    });
    expect(secondPublication.revisionId).not.toBe(firstPublication.revisionId);
    await expect(
      s.db
        .update(eventPackageRevision)
        .set({ snapshot: changedDraft })
        .where(eq(eventPackageRevision.id, firstPublication.revisionId)),
    ).rejects.toBeDefined();
    await expect(
      s.db
        .delete(eventPackageRevision)
        .where(eq(eventPackageRevision.id, firstPublication.revisionId)),
    ).rejects.toBeDefined();
    expect(
      (
        await s.db
          .select()
          .from(eventPackageRevision)
          .where(eq(eventPackageRevision.id, firstPublication.revisionId))
      )[0].snapshot,
    ).toEqual(draft);
    const event = await s.events.detail(s.manager, s.event.id);
    await s.events.save(s.manager, {
      ...eventFields(event),
      id: event.id,
      expectedVersion: event.version,
      visibility: "private",
    });
    expect(await s.packages.published(null, s.event.id)).toEqual([
      secondPublication,
    ]);
    await s.publishEvent();
    const stranger = await s.actor("package-guest");
    await expect(
      s.packages.workspace(stranger, s.event.id),
    ).rejects.toMatchObject({ status: 403 });
    expect(await s.packages.published(null, s.event.id)).toEqual([]);
    expect(await s.packages.published(stranger, s.event.id)).toEqual([]);
    expect(await s.packages.published(s.manager, s.event.id)).toEqual([
      secondPublication,
    ]);
    await s.packages.publication(s.manager, s.event.id, item.id, {
      expectedVersion: item.version,
      operation: "unpublish",
      confirmed: true,
    });
    expect(await s.packages.published(s.manager, s.event.id)).toEqual([]);
    expect((await s.current(item.id)).draft).toEqual(changedDraft);
  });

  it("C06/C08 packages: rejects foreign sources and packages, unauthorized publication, stale source changes and unsafe URLs", async () => {
    const s = await setup();
    const editor = await s.actor("package-editor");
    await s.db.insert(membership).values({
      organizationId: s.scope.organizationId,
      userId: editor.userId,
      role: "member",
      status: "approved",
    });
    const currentEvent = await s.events.detail(s.manager, s.event.id);
    await s.events.changeEditor(s.manager, {
      id: s.event.id,
      expectedVersion: currentEvent.version,
      userId: editor.userId,
      role: "editor",
      operation: "grant",
      confirmed: true,
    });
    const other = await s.events.create(s.owner, {
      ...fields,
      managerUserId: s.owner.userId,
    });
    await s.modules.change(s.owner, {
      id: other.id,
      expectedVersion: other.version,
      key: "website",
      operation: "enable",
      confirmed: true,
    });
    const sourceWorkspace = await s.packages.source(s.owner, other.id, {
      label: "Other event source",
      url: "https://luma.com/other-synthetic-package",
    });
    const foreignSource = sourceWorkspace.sources[0];
    await expect(
      s.packages.workspace(s.manager, other.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      s.packages.save(editor, s.event.id, {
        expectedVersion: 0,
        sourceId: foreignSource.id,
        draft,
      }),
    ).rejects.toThrow();
    expect((await s.packages.workspace(editor, s.event.id)).packages).toEqual(
      [],
    );
    const workspace = await s.packages.save(editor, s.event.id, {
      expectedVersion: 0,
      sourceId: null,
      draft,
    });
    const item = workspace.packages[0];
    await expect(
      s.db
        .update(eventPackage)
        .set({ sourceId: foreignSource.id })
        .where(eq(eventPackage.id, item.id)),
    ).rejects.toBeDefined();
    expect(workspace.canEdit).toBe(true);
    expect(workspace.canPublish).toBe(false);
    await expect(
      s.packages.publication(editor, s.event.id, item.id, {
        expectedVersion: item.version,
        operation: "publish",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      s.packages.publication(s.owner, other.id, item.id, {
        expectedVersion: item.version,
        operation: "publish",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const source = (
      await s.packages.source(s.manager, s.event.id, {
        label: "Local source",
        url: sourceUrl,
      })
    ).sources[0];
    await expect(
      s.db
        .update(eventPackageSource)
        .set({
          url: "https://luma.com/forbidden-source-replacement",
        })
        .where(eq(eventPackageSource.id, source.id)),
    ).rejects.toBeDefined();
    const changed = {
      id: source.id,
      expectedVersion: source.version,
      label: "Retained source",
      enabled: false,
      confirmed: true,
    };
    await expect(
      s.packages.source(editor, s.event.id, changed),
    ).rejects.toMatchObject({ status: 403 });
    await s.packages.source(s.manager, s.event.id, changed);
    await expect(
      s.packages.source(s.manager, s.event.id, changed),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.packages.source(s.owner, other.id, {
        ...changed,
        expectedVersion: source.version + 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.packages.source(s.manager, s.event.id, {
        ...changed,
        expectedVersion: source.version + 1,
        url: "https://luma.com/replacement",
      }),
    ).rejects.toThrow();
    for (const url of [
      "javascript:alert(1)",
      "https://user:secret@luma.com/event",
      "https://luma.com.evil.test/event",
    ])
      await expect(
        s.packages.source(s.manager, s.event.id, {
          label: "Unsafe source",
          url,
        }),
      ).rejects.toThrow();
    expect(
      (await s.packages.workspace(s.manager, s.event.id)).sources,
    ).toHaveLength(1);
    await s.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, editor.userId));
    await expect(
      s.packages.workspace(editor, s.event.id),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("C06/C08 packages: closes checkout on current source, integration, registration, module and event lifecycle without provider requests", async () => {
    const s = await setup();
    const noRequests = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        throw new Error(
          "Package link publishing must not fetch a provider URL.",
        );
      });
    try {
      await s.publishEvent();
      let source = (
        await s.packages.source(s.manager, s.event.id, {
          label: "Luma dinner source",
          url: sourceUrl,
        })
      ).sources[0];
      const workspace = await s.packages.save(s.manager, s.event.id, {
        expectedVersion: 0,
        sourceId: source.id,
        draft: { ...draft, showPrice: true, checkoutEnabled: true },
      });
      const packageId = workspace.packages[0].id;
      const publish = async (sourceVersion = source.version) =>
        s.packages.publication(s.manager, s.event.id, packageId, {
          expectedVersion: (await s.current(packageId)).version,
          operation: "publish",
          expectedSourceVersion: sourceVersion,
          confirmed: true,
        });
      await expect(publish()).rejects.toThrow();
      expect((await s.current(packageId)).published).toBeNull();
      await s.activateCheckout();
      await publish();
      const live = (await s.packages.published(null, s.event.id))[0];
      expect(live.checkoutUrl).toBe(sourceUrl);
      const secondSource = (
        await s.packages.source(s.manager, s.event.id, {
          label: "Second booking source",
          url: "https://lu.ma/synthetic-second-package",
        })
      ).sources.find((item) => item.id !== source.id)!;
      expect(secondSource.url).toBe(
        "https://luma.com/synthetic-second-package",
      );
      const secondPackage = (
        await s.packages.save(s.manager, s.event.id, {
          expectedVersion: 0,
          sourceId: secondSource.id,
          draft: {
            ...draft,
            title: "Second offer",
            position: 1,
            checkoutEnabled: true,
          },
        })
      ).packages.find((item) => item.id !== packageId)!;
      await s.packages.publication(s.manager, s.event.id, secondPackage.id, {
        expectedVersion: secondPackage.version,
        operation: "publish",
        expectedSourceVersion: secondSource.version,
        confirmed: true,
      });
      expect(
        (await s.packages.published(null, s.event.id)).map(
          (item) => item.checkoutUrl,
        ),
      ).toEqual([sourceUrl, secondSource.url]);
      const toggleSource = async (enabled: boolean) => {
        source = (
          await s.packages.source(s.manager, s.event.id, {
            id: source.id,
            expectedVersion: source.version,
            label: source.label,
            enabled,
            confirmed: true,
          })
        ).sources[0];
      };
      await toggleSource(false);
      expect((await s.packages.published(null, s.event.id))[0]).toEqual({
        ...live,
        checkoutUrl: null,
      });
      expect(
        (await s.packages.published(null, s.event.id))[1].checkoutUrl,
      ).toBe(secondSource.url);
      await expect(publish()).rejects.toThrow();
      await toggleSource(true);
      await expect(publish(source.version - 1)).rejects.toMatchObject({
        status: 409,
      });
      expect(
        (await s.packages.published(null, s.event.id))[0].checkoutUrl,
      ).toBe(sourceUrl);
      await s.allow(false);
      expect(
        (await s.packages.published(null, s.event.id))[0].checkoutUrl,
      ).toBeNull();
      await expect(publish()).rejects.toThrow();
      await s.allow(true);
      await s.publishLink("unpublish");
      expect(
        (await s.registrations.workspace(s.manager, s.event.id)).open,
      ).toBe(false);
      expect(
        (await s.packages.published(null, s.event.id))[0].checkoutUrl,
      ).toBeNull();
      await expect(publish()).rejects.toThrow();
      await s.publishLink();
      await s.change("registration", "disable");
      expect(
        (await s.packages.published(null, s.event.id))[0].checkoutUrl,
      ).toBeNull();
      await s.change("registration", "enable");
      await s.change("website", "disable");
      expect(await s.packages.published(null, s.event.id)).toEqual([]);
      expect((await s.current(packageId)).published).not.toBeNull();
      await s.change("website", "enable");
      await s.change("registration", "enable");
      expect(
        (await s.packages.published(null, s.event.id))[0].checkoutUrl,
      ).toBe(sourceUrl);
      const impact = await s.cancellations.preview(s.manager, s.event.id);
      await s.cancellations.cancel(s.manager, {
        id: s.event.id,
        expectedVersion: impact.expectedVersion,
        expectedConfirmed: impact.expectedConfirmed,
        confirmed: true,
      });
      expect(
        (await s.packages.published(null, s.event.id))[0].checkoutUrl,
      ).toBeNull();
      await expect(publish()).rejects.toMatchObject({
        code: "EVENT_CANCELLED",
      });
      expect(noRequests).not.toHaveBeenCalled();
    } finally {
      noRequests.mockRestore();
    }
  });

  it("C06/C08 packages: invalidates stale copy review and copies current offer drafts with checkout and publication cleared", async () => {
    const s = await setup();
    const source = (
      await s.packages.source(s.manager, s.event.id, {
        label: "Published source",
        url: sourceUrl,
      })
    ).sources[0];
    const packageDraft = { ...draft, showPrice: true, checkoutEnabled: true };
    const item = (
      await s.packages.save(s.manager, s.event.id, {
        expectedVersion: 0,
        sourceId: source.id,
        draft: packageDraft,
      })
    ).packages[0];
    await s.publishEvent();
    await s.activateCheckout();
    await s.packages.publication(s.manager, s.event.id, item.id, {
      expectedVersion: item.version,
      operation: "publish",
      expectedSourceVersion: source.version,
      confirmed: true,
    });
    const published = await s.packages.published(null, s.event.id);
    const input = {
      event: {
        ...fields,
        title: "Copied package event",
        managerUserId: s.manager.userId,
      },
      template: { kind: "copy", id: s.event.id },
    };
    const review = await s.templates.preview(s.owner, input);
    expect(review.packages).toEqual([{ title: draft.title }]);
    const nextDraft = {
      ...packageDraft,
      title: "Next private offer",
      priceMinor: 4500,
    };
    await s.packages.save(s.manager, s.event.id, {
      id: item.id,
      expectedVersion: (await s.current(item.id)).version,
      sourceId: source.id,
      draft: nextDraft,
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
    const workspace = await s.packages.workspace(s.manager, copied.id);
    expect(workspace.sources).toEqual([]);
    expect(workspace.checkoutAvailable).toBe(false);
    expect(workspace.packages).toHaveLength(1);
    expect(workspace.packages[0]).toMatchObject({
      sourceId: null,
      published: null,
      draft: { ...nextDraft, checkoutEnabled: false },
    });
    expect(workspace.packages[0].id).not.toBe(item.id);
    expect(await s.packages.published(null, copied.id)).toEqual([]);
    expect(await s.packages.published(null, s.event.id)).toEqual(published);
    expect((await s.packages.workspace(s.manager, s.event.id)).sources).toEqual(
      [source],
    );
  });
}
