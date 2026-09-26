import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { user } from "../../db/schema/auth";
import { membership, organization } from "../../db/schema/club";
import { eventManager } from "../../db/schema/events";
import {
  AuthorizationService,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { EventService } from "../../src/features/events";
import type { EventDraft } from "../../src/features/events/event_schemas";
import type { Database } from "../../src/infrastructure/database/client";
import { eventWebsiteChecks } from "./event-website-cases";
import { eventParticipationChecks } from "./event-participation-cases";
import { eventEditorialChecks } from "./event-editorial-cases";
import { eventContentChecks } from "./event-content-cases";
import { eventPrivateMediaChecks } from "./event-private-media-cases";
import { eventPackageChecks } from "./event-package-cases";
import { eventPrizeChecks } from "./event-prize-cases";
import { eventEntryChecks } from "./event-entry-cases";
import { eventDrawChecks } from "./event-draw-cases";
import { eventRegistrationChecks } from "./event-registration-cases";
import { eventTemplateChecks } from "./event-template-cases";
import { eventLumaChecks } from "./event-luma-cases";
import { lumaConnectionChecks } from "./luma-connection-cases";
import { lumaWebhookChecks } from "./luma-webhook-cases";
import { lumaSyncChecks } from "./luma-sync-cases";
import { lumaSourceChecks } from "./luma-source-cases";
import { lumaJobChecks } from "./luma-job-cases";
import { guestAccessChecks } from "./guest-access-cases";
import { purchaseChecks } from "./purchase-cases";
import { clubFeatureChecks } from "./club-feature-cases";
import { calendarChecks } from "./calendar-cases";
import { calendarSourceChecks } from "./calendar-source-cases";
import { emailChecks } from "./email-cases";
import { emailScopeChecks } from "./email-scope-cases";
import { automationProposalChecks } from "./automation-proposal-cases";

let runtime: Pool;
let migration: Pool;
let db: Database;
let authorization: AuthorizationService;
let events: EventService;
automationProposalChecks(() => ({ db, authorization, events, actor, club }));
emailChecks(() => ({ db, authorization, events, actor, club }));
emailScopeChecks(() => ({ db, authorization, events, actor, club }));
calendarChecks(() => ({ db, authorization, events, actor, club }));
calendarSourceChecks(() => ({ db, authorization, events, actor, club }));
eventWebsiteChecks(() => ({ db, authorization, events, actor, club }));
eventParticipationChecks(() => ({ db, authorization, events, actor, club }));
eventEditorialChecks(() => ({ db, authorization, events, actor, club }));
eventContentChecks(() => ({ db, authorization, events, actor, club }));
eventPrivateMediaChecks(() => ({ db, authorization, events, actor, club }));
eventPackageChecks(() => ({ db, authorization, events, actor, club }));
eventPrizeChecks(() => ({ db, authorization, events, actor, club }));
eventEntryChecks(() => ({ db, authorization, events, actor, club }));
eventDrawChecks(() => ({ db, authorization, events, actor, club }));
eventRegistrationChecks(() => ({ db, authorization, events, actor, club }));
eventTemplateChecks(() => ({ db, authorization, events, actor, club }));
eventLumaChecks(() => ({ db, authorization, events, actor, club }));
lumaConnectionChecks(() => ({ db, authorization, club }));
lumaWebhookChecks(() => ({ db, authorization, club }));
lumaSyncChecks(() => ({ db, authorization, events, actor, club }));
lumaSourceChecks(() => ({ db, authorization, events, actor, club }));
lumaJobChecks(() => ({ db, authorization, events, actor, club }));
guestAccessChecks(() => ({ db, authorization, events, actor, club }));
purchaseChecks(() => ({ db, authorization, events, actor, club }));
clubFeatureChecks(() => ({ db, authorization, events, actor, club }));
function target(connection?: string) {
  if (!connection) throw new Error("Local test configuration is required.");
  const url = new URL(connection);
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "55432" ||
    url.pathname !== "/rotapress_test"
  ) {
    throw new Error(
      "Event checks require the dedicated disposable rotapress_test database.",
    );
  }
  return connection;
}
// Explicit service fixtures; the browser journey still uses real Better Auth OTP.
async function actor(label: string): Promise<TrustedActor> {
  const userId = randomUUID();
  const email = `${label}-${userId}@example.test`;
  await db.insert(user).values({
    id: userId,
    name: `Synthetic ${label}`,
    email,
    emailVerified: true,
  });
  return {
    userId,
    email,
    emailVerified: true,
    sessionId: randomUUID(),
    authenticatedAt: new Date(),
    authMethod: "email-otp",
  };
}
async function club() {
  const owner = await actor("event-owner");
  const claim = randomBytes(32).toString("hex");
  await migration.query(
    "INSERT INTO club.installation (id,nominated_email,claim_hash,claim_expires_at) VALUES (1,$1,$2,now()+interval '5 minutes')",
    [owner.email, createHash("sha256").update(claim).digest("hex")],
  );
  await new InstallationService(db).complete(owner, {
    claim,
    name: "Synthetic event club",
    tagline: "",
    description: "",
    locale: "en",
    timezone: "Europe/Luxembourg",
    accentColor: "#25636b",
  });
  const scope = await authorization.require(owner, "events.create");
  const manager = await actor("event-manager");
  await db.insert(membership).values({
    userId: manager.userId,
    organizationId: scope.organizationId,
    status: "approved",
    role: "member",
  });
  return { owner, manager, scope };
}
const fields = {
  title: "Synthetic event",
  description: "Private planning notes",
  startsAt: "2026-12-01T17:00:00Z",
  endsAt: "2026-12-01T19:00:00Z",
  timezone: "Europe/Luxembourg",
  venue: "Synthetic venue",
  visibility: "public" as const,
};
function save(event: EventDraft) {
  return {
    ...fields,
    id: event.id,
    title: event.title,
    expectedVersion: event.version,
  };
}
beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  runtime = new Pool({ connectionString: target(env.DATABASE_URL), max: 5 });
  migration = new Pool({
    connectionString: target(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  db = drizzle(runtime, { schema });
  authorization = new AuthorizationService(db);
  events = new EventService(db, authorization);
});
beforeEach(async () => {
  await migration.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
});
afterAll(async () => {
  await Promise.all([runtime?.end(), migration?.end()]);
});

describe("C06 event drafting and current event scope", () => {
  it("grants and revokes scoped editor access without team, archive or club authority", async () => {
    const { owner, manager, scope } = await club();
    const editor = await actor("event-editor");
    const outsider = await actor("event-outsider");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: editor.userId,
      status: "approved",
      role: "member",
    });
    expect(await authorization.optional(editor)).toBeNull();
    expect(await events.hasAccess(editor)).toBe(false);
    await expect(events.list(editor)).rejects.toMatchObject({
      code: "EVENT_ACCESS_DENIED",
    });
    let event = await events.create(owner, {
      ...fields,
      managerUserId: manager.userId,
    });
    const other = await events.create(owner, {
      ...fields,
      title: "Other event",
      managerUserId: owner.userId,
    });
    const grant = () => ({
      id: event.id,
      userId: editor.userId,
      expectedVersion: event.version,
      operation: "grant",
      confirmed: true,
    });
    await expect(events.changeEditor(editor, grant())).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    await expect(
      events.changeEditor(manager, { ...grant(), confirmed: false }),
    ).rejects.toThrow();
    await expect(
      events.changeEditor(manager, { ...grant(), role: "manager" }),
    ).rejects.toThrow();
    await expect(
      events.changeEditor(
        { ...manager, authenticatedAt: new Date(Date.now() - 20 * 60_000) },
        grant(),
      ),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    await expect(
      events.changeEditor(manager, { ...grant(), userId: outsider.userId }),
    ).rejects.toMatchObject({ code: "EVENT_EDITOR_INVALID" });
    await expect(
      events.changeEditor(manager, { ...grant(), userId: manager.userId }),
    ).rejects.toMatchObject({ code: "EVENT_MANAGER_PROTECTED" });
    event = await events.changeEditor(manager, grant());
    expect((await events.detail(editor, event.id)).capabilities).toEqual([
      "events.edit",
    ]);
    expect((await events.list(editor)).map((item) => item.id)).toEqual([
      event.id,
    ]);
    expect(await events.hasAccess(editor)).toBe(true);
    expect((await events.team(editor, event.id)).candidates).toEqual([]);
    expect((await events.team(manager, event.id)).members).toHaveLength(2);
    await expect(events.team(editor, other.id)).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    await expect(events.save(editor, save(other))).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    await expect(
      events.changeEditor(editor, { ...grant(), operation: "revoke" }),
    ).rejects.toMatchObject({ code: "EVENT_ACCESS_DENIED" });
    await expect(
      events.archive(editor, { id: event.id, expectedVersion: event.version }),
    ).rejects.toMatchObject({ code: "EVENT_ACCESS_DENIED" });
    for (const capability of [
      "cms.edit",
      "members.manage",
      "settings.manage",
    ] as const)
      await expect(
        authorization.require(editor, capability),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const beforeSave = event.version;
    event = await events.save(editor, {
      ...save(event),
      title: "Editor changed own draft",
    });
    expect(event.title).toBe("Editor changed own draft");
    await expect(
      events.changeEditor(manager, {
        ...grant(),
        expectedVersion: beforeSave,
        operation: "revoke",
      }),
    ).rejects.toMatchObject({ code: "EVENT_CONFLICT" });
    // Membership and grant removal take effect for the same trusted session fixture.
    await db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, editor.userId));
    await expect(events.detail(editor, event.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    expect(
      (await events.team(manager, event.id)).members.find(
        (item) => item.userId === editor.userId,
      )?.status,
    ).toBe("suspended");
    await db
      .update(membership)
      .set({ status: "approved" })
      .where(eq(membership.userId, editor.userId));
    event = await events.changeEditor(manager, {
      ...grant(),
      operation: "revoke",
    });
    expect(await events.hasAccess(editor)).toBe(false);
    await expect(events.list(editor)).rejects.toMatchObject({
      code: "EVENT_ACCESS_DENIED",
    });
    await expect(events.detail(editor, event.id)).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    await expect(events.save(editor, save(event))).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    expect(event.title).toBe("Editor changed own draft");
    event = await events.changeEditor(manager, grant());
    // The existing manager change can promote an editor without duplicate assignments.
    event = await events.reassignManager(owner, {
      id: event.id,
      expectedVersion: event.version,
      managerUserId: editor.userId,
      confirmed: true,
    });
    expect((await events.team(editor, event.id)).members).toHaveLength(1);
    await expect(events.detail(manager, event.id)).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    await expect(
      db.insert(eventManager).values({
        eventId: event.id,
        organizationId: scope.organizationId,
        userId: manager.userId,
        role: "manager",
      }),
    ).rejects.toThrow();
    event = await events.archive(editor, {
      id: event.id,
      expectedVersion: event.version,
    });
    await expect(
      events.changeEditor(owner, { ...grant(), userId: manager.userId }),
    ).rejects.toMatchObject({ code: "EVENT_ARCHIVED" });
    expect((await events.team(editor, event.id)).members).toHaveLength(1);
    expect((await events.team(editor, event.id)).candidates).toEqual([]);
  });

  it("limits a manager to their own event and revokes access with current membership or session policy", async () => {
    const { owner, manager, scope } = await club();
    const eventA = await events.create(owner, {
      ...fields,
      title: "Event A",
      managerUserId: manager.userId,
    });
    const eventB = await events.create(owner, {
      ...fields,
      title: "Event B",
      managerUserId: owner.userId,
    });
    expect((await events.list(manager)).map((event) => event.id)).toEqual([
      eventA.id,
    ]);
    expect(await events.hasAccess(manager)).toBe(true);
    await expect(events.detail(manager, eventB.id)).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    await expect(events.save(manager, save(eventB))).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    await expect(
      events.archive(manager, { id: eventB.id, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    await expect(
      events.create(manager, { ...fields, managerUserId: manager.userId }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(events.managers(manager)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      authorization.require(manager, "cms.edit"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      events.save(manager, {
        ...save(eventA),
        organizationId: randomUUID(),
        role: "owner",
      }),
    ).rejects.toThrow();
    const missing = await actor("unapproved");
    await expect(
      events.create(owner, { ...fields, managerUserId: missing.userId }),
    ).rejects.toMatchObject({ code: "EVENT_MANAGER_INVALID" });
    await expect(
      db.insert(eventManager).values({
        eventId: randomUUID(),
        organizationId: scope.organizationId,
        userId: manager.userId,
      }),
    ).rejects.toThrow();
    await db
      .update(organization)
      .set({ staffAuthPolicy: "google" })
      .where(eq(organization.id, scope.organizationId));
    await expect(events.detail(manager, eventA.id)).rejects.toMatchObject({
      code: "GOOGLE_SESSION_REQUIRED",
    });
    expect(await events.hasAccess(manager)).toBe(false);
    await db
      .update(organization)
      .set({ staffAuthPolicy: "email-or-google" })
      .where(eq(organization.id, scope.organizationId));
    await db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, manager.userId));
    await expect(events.save(manager, save(eventA))).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    expect(await events.hasAccess(manager)).toBe(false);
  });

  it("requires a reviewed recent club-authorized reassignment and immediately revokes the former manager", async () => {
    const { owner, manager, scope } = await club();
    const next = await actor("replacement-manager");
    await db.insert(membership).values({
      organizationId: scope.organizationId,
      userId: next.userId,
      role: "member",
      status: "pending",
    });
    const event = await events.create(owner, {
      ...fields,
      managerUserId: manager.userId,
    });
    const change = {
      id: event.id,
      expectedVersion: event.version,
      managerUserId: next.userId,
      confirmed: true,
    };
    await expect(events.reassignManager(manager, change)).rejects.toMatchObject(
      { code: "ACCESS_DENIED" },
    );
    await expect(
      events.reassignManager(owner, { ...change, confirmed: false }),
    ).rejects.toThrow();
    await expect(
      events.reassignManager(
        { ...owner, authenticatedAt: new Date(Date.now() - 20 * 60_000) },
        change,
      ),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    await expect(events.reassignManager(owner, change)).rejects.toMatchObject({
      code: "EVENT_MANAGER_INVALID",
    });
    await expect(
      events.reassignManager(owner, { ...change, managerUserId: randomUUID() }),
    ).rejects.toMatchObject({ code: "EVENT_MANAGER_INVALID" });
    await db
      .update(membership)
      .set({ status: "approved" })
      .where(eq(membership.userId, next.userId));
    const changed = await events.reassignManager(owner, change);
    expect(changed).toMatchObject({
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      venue: event.venue,
      visibility: event.visibility,
      manager: { userId: next.userId },
      version: event.version + 1,
    });
    await expect(events.detail(manager, event.id)).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    await expect(events.save(manager, save(changed))).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
    expect(await events.hasAccess(manager)).toBe(false);
    expect((await events.detail(next, event.id)).manager?.userId).toBe(
      next.userId,
    );
    await expect(authorization.require(next, "cms.edit")).rejects.toMatchObject(
      { code: "ACCESS_DENIED" },
    );
    await expect(events.reassignManager(owner, change)).rejects.toMatchObject({
      code: "EVENT_CONFLICT",
    });
    const archived = await events.archive(next, {
      id: event.id,
      expectedVersion: changed.version,
    });
    await expect(
      events.reassignManager(owner, {
        ...change,
        managerUserId: manager.userId,
        expectedVersion: archived.version,
      }),
    ).rejects.toMatchObject({ code: "EVENT_ARCHIVED" });
  });

  it("preserves a single winning concurrent draft, enforces date order, and retains archived history", async () => {
    const { owner, manager } = await club();
    const event = await events.create(owner, {
      ...fields,
      managerUserId: manager.userId,
    });
    const attempts = await Promise.allSettled([
      events.save(manager, { ...save(event), title: "Draft one" }),
      events.save(owner, { ...save(event), title: "Draft two" }),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "EVENT_CONFLICT" } });
    const current = await events.detail(owner, event.id);
    expect(current.version).toBe(2);
    await expect(
      events.save(manager, {
        ...save(current),
        endsAt: "2026-11-01T00:00:00Z",
      }),
    ).rejects.toThrow();
    await expect(
      runtime.query("UPDATE club.event SET ends_at=starts_at WHERE id=$1", [
        event.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      events.archive(
        { ...manager, authenticatedAt: new Date(Date.now() - 20 * 60_000) },
        { id: event.id, expectedVersion: 2 },
      ),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    const archived = await events.archive(manager, {
      id: event.id,
      expectedVersion: 2,
    });
    expect(archived).toMatchObject({
      archived: true,
      title: current.title,
      version: 3,
    });
    expect(await events.hasAccess(manager)).toBe(true);
    expect((await events.list(manager))[0].archived).toBe(true);
    await expect(events.save(owner, save(archived))).rejects.toMatchObject({
      code: "EVENT_ARCHIVED",
    });
    expect(await events.hasAccess(null)).toBe(false);
  });
});
