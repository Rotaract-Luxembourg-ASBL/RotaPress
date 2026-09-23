import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { membership, organization } from "../../db/schema/club";
import { clubEvent, eventManager } from "../../db/schema/events";
import { guestAccess } from "../../db/schema/guest-access";
import { lumaGuestProjection } from "../../db/schema/luma-sync";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import type { EventModuleKey } from "../../src/features/events/event_modules";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import { FormService } from "../../src/features/forms/FormService";
import { MembershipService } from "../../src/features/members/MembershipService";
import { GuestAccessService } from "../../src/features/guests/GuestAccessService";
import { LumaGuestAccessSource } from "../../src/integrations/luma/LumaGuestAccessSource";
import { type Context, fixture, setup as lumaSetup } from "./luma-sync-fixture";

const fields = {
  title: "Synthetic guest gathering",
  description: "Published guest information",
  startsAt: "2026-12-10T14:00:00Z",
  endsAt: null,
  timezone: "Europe/Paris",
  venue: "Synthetic hall",
  visibility: "public" as const,
};
const confirmed = { confirmed: true };
export function guestAccessChecks(get: () => Context) {
  async function setup() {
    const context = get(),
      { db, authorization, events, actor } = context;
    const people = await context.club();
    const forms = new FormService(db, authorization);
    const registrations = new RegistrationService(
      db,
      authorization,
      new MembershipService(db, authorization, forms),
    );
    const modules = new EventModuleService(db, events);
    const guests = new GuestAccessService(
      db,
      events,
      modules,
      registrations,
      new LumaGuestAccessSource(),
    );
    const event = await events.create(people.owner, {
      ...fields,
      managerUserId: people.manager.userId,
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
        ...confirmed,
      });
    for (const key of ["website", "forms", "registration"] as const)
      await change(key, "enable");
    // Explicit published fixture; B01 uses actual publication and Better Auth OTP.
    await db
      .update(clubEvent)
      .set({ published: fields, publishedAt: new Date() })
      .where(eq(clubEvent.id, event.id));
    const draft = await forms.createEventForm(people.manager, event.id, {
      kind: "registration",
      title: "Synthetic booking",
    });
    const form = await forms.publish(people.manager, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    await registrations.configure(people.manager, event.id, {
      authority: "native",
      formId: form.id,
      capacity: 10,
      open: true,
      expectedVersion: 0,
      ...confirmed,
    });
    const first = await actor("portal-first"),
      second = await actor("portal-second");
    const register = async (person: typeof first) =>
      (
        await registrations.register(person, event.id, {
          versionId: form.publishedVersionId,
          requestId: randomUUID(),
          answers: { name: "Synthetic private answer" },
        })
      ).registration;
    const firstBooking = await register(first),
      secondBooking = await register(second);
    const invite = (sourceId = firstBooking.id) =>
      guests.grant(people.manager, event.id, {
        source: "native",
        sourceId,
        ...confirmed,
      });
    return {
      ...context,
      ...people,
      modules,
      registrations,
      guests,
      event,
      first,
      second,
      firstBooking,
      secondBooking,
      change,
      invite,
    };
  }

  it("C10 requires explicit scoped grants and binds two guests to their own records", async () => {
    const s = await setup();
    expect(await s.guests.mine(s.first)).toEqual([]);
    await expect(s.invite()).rejects.toMatchObject({
      code: "GUEST_UNAVAILABLE",
    });
    await s.change("portal", "enable");
    await expect(
      s.guests.grant(s.manager, s.event.id, {
        source: "native",
        sourceId: s.firstBooking.id,
        confirmed: false,
      }),
    ).rejects.toThrow();
    await expect(
      s.guests.grant(
        { ...s.manager, authenticatedAt: new Date(0) },
        s.event.id,
        {
          source: "native",
          sourceId: s.firstBooking.id,
          ...confirmed,
        },
      ),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    const a = await s.invite(),
      b = await s.invite(s.secondBooking.id);
    expect(await s.invite()).toEqual(a);
    expect((await s.guests.mine(s.first)).map((r) => r.id)).toEqual([a.id]);
    await expect(
      s.guests.portal(s.first, s.event.id, a.id),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    await expect(
      s.guests.claim(s.second, s.event.id, a.id, confirmed),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    // Same verified email is still insufficient for a native record owned by another user ID.
    await expect(
      s.guests.claim(
        { ...s.second, email: s.first.email },
        s.event.id,
        a.id,
        confirmed,
      ),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    await expect(
      s.guests.claim(
        { ...s.first, emailVerified: false },
        s.event.id,
        a.id,
        confirmed,
      ),
    ).rejects.toMatchObject({ code: "VERIFIED_IDENTITY_REQUIRED" });
    await expect(
      s.guests.claim(s.first, s.event.id, a.id, {
        ...confirmed,
        email: s.second.email,
      }),
    ).rejects.toThrow();
    await Promise.all([
      s.guests.claim(s.first, s.event.id, a.id, confirmed),
      s.guests.claim(s.first, s.event.id, a.id, confirmed),
    ]);
    await s.guests.claim(s.second, s.event.id, b.id, confirmed);
    await s.db
      .update(clubEvent)
      .set({
        description: "SECRET DRAFT",
        published: { ...fields, visibility: "private" },
      })
      .where(eq(clubEvent.id, s.event.id));
    const own = await s.guests.portal(s.first, s.event.id, a.id);
    expect(own.event.description).toBe(fields.description);
    expect(own.booking).toEqual({
      source: "native",
      status: "confirmed",
      observedAt: null,
    });
    expect(JSON.stringify(own)).not.toMatch(
      /SECRET DRAFT|private answer|email|userId|submissionId/,
    );
    await expect(
      s.guests.portal(s.first, s.event.id, b.id),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    expect(
      await s.db
        .select()
        .from(membership)
        .where(eq(membership.userId, s.first.userId)),
    ).toEqual([]);
    await expect(
      s.authorization.require(s.first, "admin.access"),
    ).rejects.toThrow();
    // Guest email OTP remains valid under Google's separate staff policy.
    await s.db
      .update(organization)
      .set({ staffAuthPolicy: "google" })
      .where(eq(organization.id, s.scope.organizationId));
    expect((await s.guests.portal(s.first, s.event.id, a.id)).id).toBe(a.id);
  });

  it("C10 blocks stale grants, module shutdown, cancellation and unpublished events while retaining history", async () => {
    const s = await setup();
    await s.change("portal", "enable");
    const grant = await s.invite();
    await s.guests.claim(s.first, s.event.id, grant.id, confirmed);
    await expect(
      s.guests.revoke(s.manager, s.event.id, grant.id, {
        ...confirmed,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "GUEST_CONFLICT" });
    await s.guests.revoke(s.manager, s.event.id, grant.id, {
      ...confirmed,
      expectedVersion: 2,
    });
    await expect(
      s.guests.portal(s.first, s.event.id, grant.id),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    await expect(
      s.guests.claim(s.first, s.event.id, grant.id, confirmed),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    const next = await s.invite();
    expect(next.id).not.toBe(grant.id);
    await s.guests.claim(s.first, s.event.id, next.id, confirmed);
    await s.change("portal", "disable");
    expect(await s.guests.mine(s.first)).toEqual([]);
    await expect(
      s.guests.claim(s.first, s.event.id, next.id, confirmed),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    await s.change("portal", "enable");
    await s.change("website", "disable", true);
    await s.change("website", "enable");
    await expect(
      s.guests.portal(s.first, s.event.id, next.id),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    await s.change("portal", "enable");
    expect((await s.guests.portal(s.first, s.event.id, next.id)).id).toBe(
      next.id,
    );
    for (const blocked of [
      { publishedAt: null },
      { archivedAt: new Date() },
      { cancelledAt: new Date() },
    ]) {
      await s.db
        .update(clubEvent)
        .set(blocked)
        .where(eq(clubEvent.id, s.event.id));
      expect(await s.guests.mine(s.first)).toEqual([]);
      await s.db
        .update(clubEvent)
        .set({ publishedAt: new Date(), archivedAt: null, cancelledAt: null })
        .where(eq(clubEvent.id, s.event.id));
    }
    await s.registrations.cancel(s.first, s.firstBooking.id, confirmed);
    await expect(
      s.guests.portal(s.first, s.event.id, next.id),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    expect(await s.db.select().from(guestAccess)).toHaveLength(2);
    expect((await s.registrations.mine(s.first))[0].status).toBe("cancelled");
  });

  it("C10 fences staff event scope and database source identity; registration managers can revoke after shutdown", async () => {
    const s = await setup();
    await s.change("portal", "enable");
    const editor = await s.actor("portal-editor"),
      registrar = await s.actor("portal-registrar");
    for (const [person, role] of [
      [editor, "editor"],
      [registrar, "registration-manager"],
    ] as const) {
      await s.db.insert(membership).values({
        organizationId: s.scope.organizationId,
        userId: person.userId,
        status: "approved",
        role: "member",
      });
      await s.db.insert(eventManager).values({
        organizationId: s.scope.organizationId,
        eventId: s.event.id,
        userId: person.userId,
        role,
      });
    }
    await expect(s.guests.workspace(editor, s.event.id)).rejects.toMatchObject({
      code: "EVENT_ACCESS_DENIED",
    });
    const other = await s.events.create(s.owner, {
      ...fields,
      managerUserId: s.owner.userId,
    });
    await expect(s.guests.workspace(s.manager, other.id)).rejects.toMatchObject(
      { code: "EVENT_NOT_FOUND" },
    );
    const grant = await s.guests.grant(registrar, s.event.id, {
      source: "native",
      sourceId: s.firstBooking.id,
      ...confirmed,
    });
    await expect(
      s.guests.claim(s.first, other.id, grant.id, confirmed),
    ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
    const row = (await s.db.select().from(guestAccess))[0];
    await expect(
      s.db.insert(guestAccess).values({
        ...row,
        id: randomUUID(),
        eventId: other.id,
        revokedAt: new Date(),
      }),
    ).rejects.toThrow();
    await expect(
      s.db
        .update(guestAccess)
        .set({ claimedBy: s.second.userId, claimedAt: new Date() })
        .where(eq(guestAccess.id, row.id)),
    ).rejects.toThrow();
    await s.change("portal", "disable");
    await s.guests.revoke(registrar, s.event.id, grant.id, {
      ...confirmed,
      expectedVersion: 1,
    });
    expect(
      (await s.guests.workspace(registrar, s.event.id)).grants[0].status,
    ).toBe("revoked");
    await s.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, registrar.userId));
    await expect(s.guests.workspace(registrar, s.event.id)).rejects.toThrow();
  });

  it("C10 requires an explicit provider grant and invalidates changed or missing source records", async () => {
    const provider = await fixture();
    try {
      const context = get(),
        s = await lumaSetup(context, provider.client);
      const guests = new GuestAccessService(
        s.db,
        s.events,
        s.modules,
        s.registrations,
        new LumaGuestAccessSource(),
      );
      await s.link();
      await s.reconcile();
      // The adapter fixture includes managerUserId; guest projections accept only published event fields.
      await s.db
        .update(clubEvent)
        .set({ published: { ...fields, visibility: "private" } })
        .where(eq(clubEvent.id, s.event.id));
      const person = await context.actor("imported-portal-guest");
      const [source] = await s.db.select().from(lumaGuestProjection);
      await s.db
        .update(lumaGuestProjection)
        .set({ email: person.email })
        .where(eq(lumaGuestProjection.id, source.id));
      await s.modules.change(s.manager, {
        id: s.event.id,
        expectedVersion: (await s.events.detail(s.manager, s.event.id)).version,
        key: "portal",
        operation: "enable",
        ...confirmed,
      });
      expect(await guests.mine(person)).toEqual([]);
      const grant = await guests.grant(s.manager, s.event.id, {
        source: "luma",
        sourceId: source.id,
        ...confirmed,
      });
      await guests.claim(person, s.event.id, grant.id, confirmed);
      const own = await guests.portal(person, s.event.id, grant.id);
      expect(own.booking).toMatchObject({ source: "luma", status: "approved" });
      expect(Object.keys(own.booking).sort()).toEqual([
        "observedAt",
        "source",
        "status",
      ]);
      for (const changed of [
        { email: "changed@example.test" },
        { present: false },
        { approvalStatus: "declined" as const },
      ]) {
        await s.db
          .update(lumaGuestProjection)
          .set(changed)
          .where(eq(lumaGuestProjection.id, source.id));
        expect(await guests.mine(person)).toEqual([]);
        await expect(
          guests.portal(person, s.event.id, grant.id),
        ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
        await s.db
          .update(lumaGuestProjection)
          .set({
            email: person.email,
            present: true,
            approvalStatus: "approved",
          })
          .where(eq(lumaGuestProjection.id, source.id));
      }
      const different = await context.actor("provider-impostor");
      await expect(
        guests.claim(
          { ...different, email: person.email },
          s.event.id,
          grant.id,
          confirmed,
        ),
      ).rejects.toMatchObject({ code: "GUEST_UNAVAILABLE" });
      expect(await s.db.select().from(guestAccess)).toHaveLength(1);
    } finally {
      await provider.close();
    }
  });
}
