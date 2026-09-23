import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { organization } from "../../db/schema/club";
import { formNotification, formSubmission } from "../../db/schema/forms";
import type {
  AuthorizationService,
  StaffAccess,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { FeatureService } from "../../src/core/features/FeatureService";
import type { Database } from "../../src/infrastructure/database/client";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { EventWebsiteService } from "../../src/features/events/EventWebsiteService";
import { EventPublicAccess } from "../../src/features/events/EventPublicAccess";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import { FormService } from "../../src/features/forms/FormService";
import { SubmissionService } from "../../src/features/forms/SubmissionService";
import { FormNotificationRunner } from "../../src/features/forms/FormNotificationRunner";
import { MembershipService } from "../../src/features/members/MembershipService";
import { MediaService } from "../../src/features/media/MediaService";
import { CmsService } from "../../src/features/cms/CmsService";

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
const change = (
  key: "forms" | "events",
  enabled: boolean,
  expectedVersion = 0,
) => ({ key, enabled, expectedVersion, confirmed: true });

export function clubFeatureChecks(get: () => Context) {
  async function setup() {
    const context = get();
    const people = await context.club();
    const forms = new FormService(context.db, context.authorization);
    const members = new MembershipService(
      context.db,
      context.authorization,
      forms,
    );
    return {
      ...context,
      ...people,
      forms,
      members,
      features: new FeatureService(context.db, context.authorization),
      submissions: new SubmissionService(
        context.db,
        context.authorization,
        members,
      ),
    };
  }

  it("C06 club features require current administrator authority, confirmation and an unchanged version", async () => {
    const s = await setup();
    const current = await s.features.workspace(s.owner);
    expect(current.features).toEqual([
      { key: "forms", enabled: true, version: 0 },
      { key: "events", enabled: true, version: 0 },
      { key: "calendar", enabled: true, version: 0 },
    ]);
    await expect(s.features.workspace(s.manager)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      s.features.configure(s.manager, change("events", false)),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      s.features.configure(s.owner, {
        ...change("events", false),
        confirmed: false,
      }),
    ).rejects.toThrow();
    await expect(
      s.features.configure(s.owner, {
        ...change("events", false),
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      s.features.configure(
        { ...s.owner, authenticatedAt: new Date(0) },
        change("events", false),
      ),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    const results = await Promise.allSettled([
      s.features.configure(s.owner, change("events", false)),
      s.features.configure(s.owner, change("events", false)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    await expect(
      s.authorization.require(s.owner, "events.create"),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(
      s.authorization.require(s.owner, "integrations.manage"),
    ).resolves.toMatchObject({ role: "owner" });
    await expect(
      s.authorization.require(s.owner, "cms.edit"),
    ).resolves.toBeDefined();
    await s.db
      .update(organization)
      .set({ staffAuthPolicy: "google" })
      .where(eq(organization.id, s.scope.organizationId));
    await expect(
      s.features.configure(s.owner, change("events", true, 1)),
    ).rejects.toMatchObject({ code: "GOOGLE_SESSION_REQUIRED" });
  });

  it("C05 club feature disabling protects forms, retains responses and never replays old notifications on enable", async () => {
    const s = await setup();
    const draft = await s.forms.create(s.owner, { kind: "contact" });
    await s.forms.updateSettings(s.owner, draft.id, {
      recipients: ["synthetic@example.test"],
      retentionDays: null,
    });
    await s.forms.publish(s.owner, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    const before = await s.forms.detail(s.owner, draft.id);
    const input = {
      versionId: before.publishedVersionId!,
      requestId: randomUUID(),
      answers: {
        name: "Synthetic",
        email: "synthetic@example.test",
        message: "Local test",
      },
    };
    const receipt = await s.submissions.submit(null, draft.id, input);
    const rows = await s.db.select().from(formSubmission);
    const application = await s.forms.create(s.owner, { kind: "membership" });
    await s.forms.publish(s.owner, application.id, {
      expectedRevision: application.draftRevision,
    });
    await s.features.configure(s.owner, change("forms", false));
    await expect(s.forms.list(s.owner)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(s.forms.publicForm(draft.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.submissions.submit(null, draft.id, input),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      s.submissions.detail(s.owner, receipt.id),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(
      s.members.apply(await s.actor("paused-applicant")),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(s.forms.publishedMembershipForm()).rejects.toMatchObject({
      code: "APPLICATIONS_PAUSED",
    });
    await expect(s.members.list(s.owner)).resolves.toBeDefined();
    await s.features.configure(s.owner, change("forms", true, 1));
    expect(await s.forms.detail(s.owner, draft.id)).toEqual(before);
    expect(await s.db.select().from(formSubmission)).toEqual(rows);
    const mailer = { sendSubmissionNotification: vi.fn(async () => {}) };
    const runner = new FormNotificationRunner(
      s.db,
      mailer,
      "http://127.0.0.1:4100",
    );
    expect((await runner.runBatch()).sent).toBe(0);
    expect(mailer.sendSubmissionNotification).not.toHaveBeenCalled();
    expect((await s.db.select().from(formNotification))[0]).toMatchObject({
      status: "failed",
      lastErrorCode: "FEATURE_DISABLED",
    });
    await s.submissions.retryNotification(s.owner, receipt.id);
    expect((await runner.runBatch()).sent).toBe(1);
    expect(mailer.sendSubmissionNotification).toHaveBeenCalledTimes(1);
  });

  it("C06 club Events and Forms switches preserve published content, menu references, modules and native registrations", async () => {
    const s = await setup();
    const modules = new EventModuleService(s.db, s.events);
    const media = new MediaService(
      s.db,
      s.authorization,
      new LocalStorageDriver(resolve(".local/test-uploads")),
    );
    const cms = new CmsService(
      s.db,
      s.authorization,
      media,
      s.forms,
      s.events,
      modules,
    );
    const website = new EventWebsiteService(
      s.db,
      s.authorization,
      s.events,
      modules,
      cms,
    );
    const registrations = new RegistrationService(
      s.db,
      s.authorization,
      s.members,
    );
    let event = await s.events.create(s.owner, {
      title: "Synthetic feature lifecycle",
      description: "Published event",
      startsAt: "2026-12-01T17:00:00Z",
      endsAt: null,
      timezone: "Europe/Luxembourg",
      venue: "Synthetic hall",
      visibility: "public",
      managerUserId: s.manager.userId,
    });
    for (const key of ["website", "forms", "registration", "portal"] as const) {
      event = await modules.change(s.manager, {
        id: event.id,
        expectedVersion: event.version,
        key,
        operation: "enable",
        confirmed: true,
      });
    }
    const page = await cms.create(s.manager, {
      kind: "page",
      locale: "en",
      title: "Event landing",
      slug: "event-landing",
      event: { id: event.id, moduleKey: "website" },
    });
    await cms.publish(s.manager, {
      id: page.id,
      locale: "en",
      expectedRevisionId: page.draft.id,
    });
    event = await website.publication(s.manager, {
      id: event.id,
      expectedVersion: event.version,
      operation: "publish",
      confirmed: true,
    });
    const form = await s.forms.createEventForm(s.manager, event.id, {
      kind: "registration",
      title: "Reserve a place",
    });
    const published = await s.forms.publish(s.manager, form.id, {
      expectedRevision: form.draftRevision,
    });
    await registrations.configure(s.manager, event.id, {
      expectedVersion: 0,
      authority: "native",
      formId: form.id,
      capacity: 20,
      open: true,
      confirmed: true,
    });
    const guest = await s.actor("feature-guest");
    const input = {
      versionId: published.publishedVersionId!,
      requestId: randomUUID(),
      answers: { name: "Synthetic guest" },
    };
    await registrations.register(guest, event.id, input);
    let site = await cms.getSite(s.owner, "en");
    site = await cms.saveSite(s.owner, {
      locale: "en",
      expectedVersion: site.version,
      settings: {
        ...site.draft,
        navigation: [{ label: "Events", systemPage: "events" }],
      },
    });
    await cms.publishSite(s.owner, {
      locale: "en",
      expectedVersion: site.version,
    });
    const snapshot = {
      event: await s.events.detail(s.owner, event.id),
      modules: await modules.states(s.scope.organizationId, event.id),
      site: await cms.getSite(s.owner, "en"),
      page: await cms.detail(s.owner, page.id, "en"),
      registrations: await registrations.mine(guest),
    };
    await s.features.configure(s.owner, change("forms", false));
    expect(await website.publicPage(event.id, "en", "website")).not.toBeNull();
    await expect(
      registrations.publicForm(null, event.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      registrations.register(guest, event.id, input),
    ).rejects.toMatchObject({ status: 404 });
    await s.features.configure(s.owner, change("events", false));
    expect(await s.events.hasAccess(s.manager)).toBe(false);
    await expect(s.events.detail(s.manager, event.id)).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    await expect(cms.detail(s.manager, page.id, "en")).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    expect(await website.publicList("en")).toEqual([]);
    expect(await website.publicPage(event.id, "en", "website")).toBeNull();
    expect((await cms.publicSite("en")).navigation).toEqual([]);
    await expect(
      new EventPublicAccess(s.db, s.events, modules).require(
        null,
        event.id,
        "portal",
      ),
    ).rejects.toMatchObject({ status: 404 });
    await s.features.configure(s.owner, change("events", true, 1));
    await expect(
      registrations.publicForm(null, event.id),
    ).rejects.toMatchObject({ status: 404 });
    await s.features.configure(s.owner, change("forms", true, 1));
    expect(await s.events.detail(s.owner, event.id)).toEqual(snapshot.event);
    expect(await modules.states(s.scope.organizationId, event.id)).toEqual(
      snapshot.modules,
    );
    expect(await cms.getSite(s.owner, "en")).toEqual(snapshot.site);
    expect(await cms.detail(s.owner, page.id, "en")).toEqual(snapshot.page);
    expect(await registrations.mine(guest)).toEqual(snapshot.registrations);
    expect((await cms.publicSite("en")).navigation).toEqual([
      { label: "Events", href: "/events?locale=en" },
    ]);
    expect(await registrations.publicForm(null, event.id)).toBeDefined();
  });
}
