import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { FeatureService } from "../../src/core/features/FeatureService";
import sharp from "sharp";
import { session, user } from "../../db/schema/auth";
import { auditEntry, membership, organization } from "../../db/schema/club";
import { cmsPublicationJob } from "../../db/schema/publication-jobs";
import type {
  AuthorizationService,
  TrustedActor,
  StaffAccess,
  ResolveScheduledActor,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import { CmsService } from "../../src/features/cms/CmsService";
import { CmsRepository } from "../../src/features/cms/CmsRepository";
import { CmsScopePolicy } from "../../src/features/cms/CmsScopePolicy";
import { CmsPublicationSchedule } from "../../src/features/cms/CmsPublicationSchedule";
import { CmsPublicationRunner } from "../../src/features/cms/CmsPublicationRunner";
import { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { MediaService } from "../../src/features/media/MediaService";
import type { CmsDetail } from "../../src/features/cms/cms_schemas";

type Context = {
  db: Database;
  cms: CmsService;
  media: MediaService;
  authorization: AuthorizationService;
  actor: (label: string) => Promise<TrustedActor>;
  installedClub: () => Promise<{ owner: TrustedActor; scope: StaffAccess }>;
};
const action = (p: CmsDetail) => ({
  id: p.id,
  locale: p.locale,
  expectedRevisionId: p.draft.id,
});
const edit = (p: CmsDetail, text = "New saved draft") => ({
  ...action(p),
  title: p.draft.title,
  slug: p.draft.slug,
  description: "",
  socialImageId: null,
  data: {
    root: { props: {} },
    content: [{ type: "RichText", props: { id: "text", version: 1, text } }],
  },
});

export function publicationChecks(get: () => Context) {
  async function setup() {
    const { db, cms, media, authorization } = get();
    const { owner, scope } = await get().installedClub();
    // Explicit synthetic service fixture. B02 uses real library-created OTP sessions.
    await db.insert(session).values({
      id: owner.sessionId,
      userId: owner.userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
      authMethod: "email-otp",
    });
    const resolve: ResolveScheduledActor = async (sessionId, userId) => {
      const [row] = await db
        .select({ s: session, u: user })
        .from(session)
        .innerJoin(user, eq(session.userId, user.id))
        .where(and(eq(session.id, sessionId), eq(session.userId, userId)));
      if (!row || row.s.expiresAt.getTime() <= Date.now()) return null;
      return {
        expiresAt: row.s.expiresAt,
        actor: {
          ...owner,
          userId: row.u.id,
          email: row.u.email,
          emailVerified: row.u.emailVerified,
          sessionId: row.s.id,
          authenticatedAt: row.s.createdAt,
          authMethod:
            row.s.authMethod === "email-otp" ? "email-otp" : "unknown",
        },
      };
    };
    const events = new EventService(db, authorization),
      modules = new EventModuleService(db, events);
    const policy = new CmsScopePolicy(
      db,
      authorization,
      new CmsRepository(db),
      events,
      modules,
      media,
    );
    const schedules = new CmsPublicationSchedule(db, policy, resolve);
    const runner = (resolver = resolve) =>
      new CmsPublicationRunner(db, cms, policy, resolver);
    const page = await cms.create(owner, {
      kind: "page",
      locale: "en",
      title: "Synthetic scheduled page",
      slug: "scheduled-page",
    });
    const values = async (p = page) => ({
      ...action(p),
      dueAt: new Date(Date.now() + 120_000).toISOString(),
      expectedJobId: (await schedules.workspace(owner, p.id, p.locale))
        .activeId,
      requestId: randomUUID(),
      confirmed: true,
    });
    const queue = async (p = page) =>
      schedules.schedule(owner, await values(p));
    const due = async () => {
      await db
        .update(cmsPublicationJob)
        .set({ dueAt: new Date(Date.now() - 1000), availableAt: new Date(0) });
    };
    return {
      db,
      cms,
      media,
      owner,
      scope,
      events,
      modules,
      schedules,
      runner,
      resolve,
      page,
      values,
      queue,
      due,
    };
  }
  it("C09 does not publish queued event content after Events is disabled and re-enabled", async () => {
    const s = await setup();
    let event = await s.events.create(s.owner, {
      title: "Synthetic scheduled event",
      description: "",
      startsAt: "2026-12-01T17:00:00Z",
      endsAt: null,
      timezone: "Europe/Luxembourg",
      venue: "",
      visibility: "public",
      managerUserId: s.owner.userId,
    });
    event = await s.modules.change(s.owner, {
      id: event.id,
      expectedVersion: event.version,
      key: "website",
      operation: "enable",
      confirmed: true,
    });
    const page = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Scheduled event page",
      slug: "scheduled-event",
      event: { id: event.id, moduleKey: "website" },
    });
    await s.queue(page);
    const features = new FeatureService(s.db, get().authorization);
    await features.configure(s.owner, {
      key: "events",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    await features.configure(s.owner, {
      key: "events",
      enabled: true,
      expectedVersion: 1,
      confirmed: true,
    });
    await s.due();
    expect((await s.runner().runBatch()).cancelled).toBe(1);
    const saved = await s.cms.detail(s.owner, page.id, "en");
    expect(saved.draft).toEqual(page.draft);
    expect(saved.publishedRevisionId).toBeNull();
  });

  it("C09 queues a private exact revision with reviewed scoped access, request replay and one atomic publication", async () => {
    const s = await setup();
    const input = await s.values();
    await expect(
      s.schedules.schedule(s.owner, { ...input, confirmed: false }),
    ).rejects.toThrow();
    const member = await get().actor("scheduled-member");
    await s.db.insert(membership).values({
      userId: member.userId,
      organizationId: s.scope.organizationId,
      role: "member",
      status: "approved",
    });
    await expect(
      s.schedules.workspace(member, s.page.id, "en"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(s.schedules.schedule(member, input)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      s.schedules.schedule(s.owner, {
        ...input,
        dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "SCHEDULE_TIME" });
    await s.schedules.schedule(s.owner, input);
    await s.schedules.schedule(s.owner, input);
    expect(await s.db.select().from(cmsPublicationJob)).toHaveLength(1);
    expect(
      JSON.stringify(await s.schedules.workspace(s.owner, s.page.id, "en")),
    ).not.toMatch(/sessionId|requestedBy|leaseToken/);
    expect(await s.cms.publicPage("en", "scheduled-page")).toBeNull();
    expect((await s.runner().runBatch()).processed).toBe(0);
    await s.due();
    const results = await Promise.all([
      s.runner().runBatch(),
      s.runner().runBatch(),
    ]);
    expect(results.reduce((n, r) => n + r.published, 0)).toBe(1);
    expect(
      (await s.cms.detail(s.owner, s.page.id, "en")).publishedRevisionId,
    ).toBe(s.page.draft.id);
    expect((await s.runner().runBatch()).processed).toBe(0);
    expect(
      await s.db
        .select()
        .from(auditEntry)
        .where(eq(auditEntry.action, "cms.published")),
    ).toHaveLength(1);
  });
  it("C09 cancellation or replacement fences an already claimed job", async () => {
    const s = await setup();
    for (const replace of [false, true]) {
      const first = await s.queue();
      await s.due();
      let release!: () => void,
        started = false;
      const hold = new Promise<void>((r) => {
        release = r;
      });
      const running = s
        .runner(async (...args) => {
          started = true;
          await hold;
          return s.resolve(...args);
        })
        .runBatch(1);
      await expect.poll(() => started).toBe(true);
      if (replace) await s.queue();
      else
        await s.schedules.cancel(s.owner, {
          id: s.page.id,
          locale: "en",
          jobId: first.activeId,
          confirmed: true,
        });
      release();
      expect((await running).published).toBe(0);
      expect(await s.cms.publicPage("en", "scheduled-page")).toBeNull();
      if (replace) {
        expect(
          (await s.schedules.workspace(s.owner, s.page.id, "en")).jobs.find(
            (j) => j.id === first.activeId,
          )?.status,
        ).toBe("cancelled");
        await s.due();
        expect((await s.runner().runBatch()).published).toBe(1);
      }
    }
  });
  it("C09 draft changes and manual unpublication invalidate scheduled revisions", async () => {
    const s = await setup();
    let page = s.page;
    await s.queue(page);
    page = await s.cms.save(s.owner, edit(page));
    await s.due();
    expect((await s.runner().runBatch()).cancelled).toBe(1);
    expect(await s.cms.publicPage("en", "scheduled-page")).toBeNull();
    await s.queue(page);
    await s.cms.unpublish(s.owner, action(page));
    await s.due();
    expect((await s.runner().runBatch()).cancelled).toBe(1);
    expect(await s.cms.publicPage("en", "scheduled-page")).toBeNull();
    await s.queue(page);
    await s.cms.archive(s.owner, action(page));
    await s.due();
    expect((await s.runner().runBatch()).cancelled).toBe(1);
  });
  it("C09 rechecks session, current membership and authentication policy at execution", async () => {
    const s = await setup();
    for (const change of [
      "expiry",
      "membership",
      "policy",
      "revocation",
    ] as const) {
      await s.queue();
      await s.due();
      if (change === "expiry")
        await s.db.update(session).set({ expiresAt: new Date(0) });
      if (change === "membership")
        await s.db
          .update(membership)
          .set({ status: "suspended" })
          .where(eq(membership.userId, s.owner.userId));
      if (change === "policy")
        await s.db.update(organization).set({ staffAuthPolicy: "google" });
      if (change === "revocation") await s.db.delete(session);
      expect((await s.runner().runBatch()).cancelled).toBe(1);
      expect(await s.cms.publicPage("en", "scheduled-page")).toBeNull();
      if (change === "expiry")
        await s.db
          .update(session)
          .set({ expiresAt: new Date(Date.now() + 86_400_000) });
      if (change === "membership")
        await s.db
          .update(membership)
          .set({ status: "approved" })
          .where(eq(membership.userId, s.owner.userId));
      if (change === "policy")
        await s.db
          .update(organization)
          .set({ staffAuthPolicy: "email-or-google" });
    }
  });
  it("C09 recovers expired leases after restart and bounds retry attempts", async () => {
    const s = await setup();
    const queued = await s.queue();
    await s.due();
    await s.db.update(cmsPublicationJob).set({
      status: "processing",
      attempts: 1,
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(0),
    });
    expect((await s.runner().runBatch()).published).toBe(1);
    expect(
      (await s.schedules.workspace(s.owner, s.page.id, "en")).jobs[0],
    ).toMatchObject({ id: queued.activeId, attempts: 2, status: "succeeded" });
    const page = await s.cms.save(
      s.owner,
      edit(await s.cms.detail(s.owner, s.page.id, "en")),
    );
    await s.queue(page);
    const unavailable: ResolveScheduledActor = async () => {
      throw new Error("synthetic-private-diagnostic");
    };
    for (let i = 0; i < 3; i++) {
      await s.due();
      await s.runner(unavailable).runBatch();
    }
    expect(
      (await s.schedules.workspace(s.owner, s.page.id, "en")).jobs[0],
    ).toMatchObject({ attempts: 3, status: "failed" });
    expect(
      JSON.stringify(await s.schedules.workspace(s.owner, s.page.id, "en")),
    ).not.toContain("synthetic-private-diagnostic");
    expect((await s.runner().runBatch()).processed).toBe(0);
  });
  it("C09 revalidates private media and disabled event features without changing publication", async () => {
    const s = await setup();
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#123456" },
    })
      .png()
      .toBuffer();
    const image = await s.media.upload(s.owner, {
      bytes,
      filename: "synthetic.png",
      title: "Synthetic image",
    });
    const page = await s.cms.save(s.owner, {
      ...edit(s.page),
      socialImageId: image.id,
    });
    await s.queue(page);
    await s.due();
    expect((await s.runner().runBatch()).failed).toBe(1);
    expect(await s.cms.publicPage("en", "scheduled-page")).toBeNull();
    let event = await s.events.create(s.owner, {
      title: "Synthetic scheduled event",
      description: "",
      startsAt: "2026-12-15T10:00:00Z",
      endsAt: null,
      timezone: "Europe/Paris",
      venue: "",
      visibility: "private",
      managerUserId: s.owner.userId,
    });
    event = await s.modules.change(s.owner, {
      id: event.id,
      expectedVersion: event.version,
      key: "website",
      operation: "enable",
      confirmed: true,
      suspendDependents: false,
    });
    const eventPage = await s.cms.create(s.owner, {
      kind: "page",
      locale: "en",
      title: "Event page",
      slug: "event-page",
      event: { id: event.id, moduleKey: "website" },
    });
    await s.queue(eventPage);
    await s.modules.change(s.owner, {
      id: event.id,
      expectedVersion: event.version,
      key: "website",
      operation: "disable",
      confirmed: true,
      suspendDependents: false,
    });
    await s.due();
    expect((await s.runner().runBatch()).cancelled).toBe(1);
    expect(
      (await s.cms.detail(s.owner, eventPage.id, "en")).publishedRevisionId,
    ).toBeNull();
  });
}
