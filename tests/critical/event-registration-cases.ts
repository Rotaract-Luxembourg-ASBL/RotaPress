import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { membership } from "../../db/schema/club";
import { clubEvent } from "../../db/schema/events";
import { formNotification, formSubmission } from "../../db/schema/forms";
import {
  eventRegistration,
  registrationSettings,
} from "../../db/schema/registrations";
import type {
  AuthorizationService,
  TrustedActor,
  StaffAccess,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import { FormService } from "../../src/features/forms/FormService";
import { SubmissionService } from "../../src/features/forms/SubmissionService";
import { FormNotificationRunner } from "../../src/features/forms/FormNotificationRunner";
import { MembershipService } from "../../src/features/members/MembershipService";
import { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { RegistrationService } from "../../src/features/events/RegistrationService";
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
  title: "Synthetic limited event",
  description: "Published description",
  startsAt: "2026-12-05T12:00:00Z",
  endsAt: null,
  timezone: "Europe/Luxembourg",
  venue: "Synthetic hall",
  visibility: "public" as const,
};
export function eventRegistrationChecks(get: () => Context) {
  async function setup() {
    const { db, authorization, events, club, actor } = get();
    const people = await club();
    const forms = new FormService(db, authorization);
    const members = new MembershipService(db, authorization, forms);
    const submissions = new SubmissionService(db, authorization, members);
    const registrations = new RegistrationService(db, authorization, members);
    const modules = new EventModuleService(db, events);
    let event = await events.create(people.owner, {
      ...fields,
      managerUserId: people.manager.userId,
    });
    const change = async (
      key: EventModuleKey,
      operation: "enable" | "disable",
      suspendDependents = false,
    ) => {
      event = await modules.change(people.manager, {
        id: event.id,
        expectedVersion: (await events.detail(people.manager, event.id))
          .version,
        key,
        operation,
        confirmed: true,
        suspendDependents,
      });
    };
    for (const key of ["website", "forms", "registration"] as const)
      await change(key, "enable");
    // A published event is a deliberate fixture here; the browser uses the real CMS publication action.
    await db
      .update(clubEvent)
      .set({ published: fields, publishedAt: new Date() })
      .where(eq(clubEvent.id, event.id));
    const draft = await forms.createEventForm(people.manager, event.id, {
      kind: "registration",
      title: "Reserve a place",
    });
    await forms.updateSettings(people.manager, draft.id, {
      recipients: ["synthetic-reviewer@example.test"],
      retentionDays: null,
    });
    const form = await forms.publish(people.manager, draft.id, {
      expectedRevision: draft.draftRevision,
    });
    const configure = (extra: object = {}) => ({
      expectedVersion: 0,
      authority: "native",
      formId: form.id,
      capacity: 1,
      open: true,
      confirmed: true,
      ...extra,
    });
    await registrations.configure(people.manager, event.id, configure());
    const response = (name = "Synthetic guest") => ({
      versionId: form.publishedVersionId!,
      requestId: randomUUID(),
      answers: { name },
    });
    return {
      db,
      events,
      actor,
      ...people,
      forms,
      submissions,
      registrations,
      modules,
      event,
      change,
      form,
      configure,
      response,
    };
  }

  it("C07 serializes the final place, replays requests and preserves one registration authority", async () => {
    const s = await setup();
    const guests = await Promise.all([
      s.actor("guest-one"),
      s.actor("guest-two"),
    ]);
    const responses = guests.map(() => s.response());
    const results = await Promise.allSettled(
      guests.map((guest, i) =>
        s.registrations.register(guest, s.event.id, responses[i]),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const winnerIndex = results.findIndex(
      (result) => result.status === "fulfilled",
    );
    const winner = guests[winnerIndex],
      loser = guests[1 - winnerIndex];
    const first = results[winnerIndex];
    if (first.status !== "fulfilled")
      throw new Error("Expected one registration receipt");
    expect(results[1 - winnerIndex]).toMatchObject({
      status: "rejected",
      reason: { code: "EVENT_FULL" },
    });
    expect(await s.db.select().from(eventRegistration)).toHaveLength(1);
    expect(await s.db.select().from(formSubmission)).toHaveLength(1);
    expect(await s.db.select().from(formNotification)).toHaveLength(1);
    expect(
      await s.db
        .select()
        .from(membership)
        .where(eq(membership.userId, winner.userId)),
    ).toHaveLength(0);
    const replay = await s.registrations.register(
      winner,
      s.event.id,
      responses[winnerIndex],
    );
    expect(replay.duplicate).toBe(true);
    expect(replay.registration.id).toBe(first.value.registration.id);
    await expect(
      s.registrations.register(loser, s.event.id, responses[winnerIndex]),
    ).rejects.toMatchObject({ code: "SUBMISSION_REPLAY_CONFLICT" });
    await expect(
      s.registrations.register(winner, s.event.id, s.response()),
    ).rejects.toMatchObject({ code: "ALREADY_REGISTERED" });
    await expect(
      s.submissions.submit(winner, s.form.id, s.response()),
    ).rejects.toMatchObject({ code: "REGISTRATION_REQUIRED" });
    await expect(s.forms.publicForm(s.form.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.registrations.configure(
        s.manager,
        s.event.id,
        s.configure({
          expectedVersion: 1,
          authority: "none",
          formId: null,
          open: false,
        }),
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_AUTHORITY_LOCKED" });
    await expect(
      s.registrations.configure(
        s.manager,
        s.event.id,
        s.configure({ expectedVersion: 1, authority: "external" }),
      ),
    ).rejects.toThrow();
    await expect(
      s.registrations.configure(
        s.manager,
        s.event.id,
        s.configure({ expectedVersion: 1, confirmed: false }),
      ),
    ).rejects.toThrow();
    await s.registrations.configure(
      s.manager,
      s.event.id,
      s.configure({ expectedVersion: 1, open: false }),
    );
    expect(
      (
        await s.registrations.register(
          winner,
          s.event.id,
          responses[winnerIndex],
        )
      ).duplicate,
    ).toBe(true);
    await expect(
      s.registrations.register(loser, s.event.id, s.response()),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
    await expect(
      s.registrations.cancel(loser, first.value.registration.id, {
        confirmed: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      s.submissions.delete(s.manager, first.value.id, { confirm: true }),
    ).rejects.toMatchObject({ code: "REGISTRATION_RECORD_RETAINED" });
    await s.registrations.cancel(winner, first.value.registration.id, {
      confirmed: true,
    });
    expect(
      (
        await s.registrations.cancel(winner, first.value.registration.id, {
          confirmed: true,
        })
      ).status,
    ).toBe("cancelled");
    expect(
      (
        await s.registrations.register(
          winner,
          s.event.id,
          responses[winnerIndex],
        )
      ).registration.status,
    ).toBe("cancelled");
    await s.registrations.configure(
      s.manager,
      s.event.id,
      s.configure({ expectedVersion: 2 }),
    );
    await s.registrations.register(loser, s.event.id, s.response());
    expect(
      (await s.registrations.workspace(s.manager, s.event.id)).confirmedCount,
    ).toBe(1);
    expect((await s.registrations.mine(winner)).map((r) => r.status)).toEqual([
      "cancelled",
    ]);
    expect(await s.db.select().from(formSubmission)).toHaveLength(2);
  });

  it("C05/C06 scopes event forms, private responses and specialist roles to the current event", async () => {
    const s = await setup();
    const editor = await s.actor("form-editor"),
      reviewer = await s.actor("registration-manager");
    for (const actor of [editor, reviewer])
      await s.db.insert(membership).values({
        organizationId: s.scope.organizationId,
        userId: actor.userId,
        role: "member",
        status: "approved",
      });
    for (const [actor, role] of [
      [editor, "editor"],
      [reviewer, "registration-manager"],
    ] as const) {
      await s.events.changeEditor(s.manager, {
        id: s.event.id,
        expectedVersion: (await s.events.detail(s.manager, s.event.id)).version,
        userId: actor.userId,
        role,
        operation: "grant",
        confirmed: true,
      });
    }
    let form = await s.forms.createEventForm(editor, s.event.id, {
      kind: "event",
      title: "Event questions",
    });
    await expect(s.forms.publicForm(form.id)).rejects.toMatchObject({
      status: 404,
    });
    form = await s.forms.save(editor, form.id, {
      expectedRevision: form.draftRevision,
      definition: { ...form.draft, description: "Event-only questions" },
    });
    await expect(
      s.forms.publish(editor, form.id, {
        expectedRevision: form.draftRevision,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      s.forms.save(reviewer, form.id, {
        expectedRevision: form.draftRevision,
        definition: form.draft,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(s.forms.settings(editor, form.id)).rejects.toMatchObject({
      status: 403,
    });
    form = await s.forms.publish(s.manager, form.id, {
      expectedRevision: form.draftRevision,
    });
    expect((await s.forms.list(s.owner)).some((f) => f.id === form.id)).toBe(
      false,
    );
    await expect(
      s.forms.assertOwnedForms(s.scope.organizationId, [form.id]),
    ).rejects.toMatchObject({ code: "FORM_SCOPE" });
    await s.db
      .update(clubEvent)
      .set({ published: { ...fields, visibility: "private" } })
      .where(eq(clubEvent.id, s.event.id));
    const input = {
      versionId: form.publishedVersionId!,
      requestId: randomUUID(),
      answers: {
        name: "Synthetic",
        email: "synthetic@example.test",
        message: "A private event question",
      },
    };
    await expect(s.forms.publicForm(form.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.submissions.submit(null, form.id, input),
    ).rejects.toMatchObject({ status: 404 });
    expect((await s.forms.publicForm(form.id, editor)).id).toBe(form.id);
    const receipt = await s.submissions.submit(editor, form.id, input);
    await expect(s.submissions.list(editor, form.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      s.submissions.detail(editor, receipt.id),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await s.submissions.detail(reviewer, receipt.id)).answers.message,
    ).toBe(input.answers.message);
    expect(await s.submissions.exportCsv(reviewer, form.id)).toContain(
      input.answers.message,
    );
    const other = await s.events.create(s.owner, {
      ...fields,
      managerUserId: s.owner.userId,
    });
    await expect(s.forms.eventForms(reviewer, other.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.registrations.list(reviewer, other.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      s.registrations.configure(
        reviewer,
        s.event.id,
        s.configure({ expectedVersion: 1 }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await s.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, reviewer.userId));
    await expect(
      s.submissions.detail(reviewer, receipt.id),
    ).rejects.toMatchObject({ status: 403 });
    await s.db
      .update(clubEvent)
      .set({ published: null, publishedAt: null })
      .where(eq(clubEvent.id, s.event.id));
    await expect(s.forms.publicForm(form.id, s.manager)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.registrations.publicForm(s.manager, s.event.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("C06/C07 pauses disabled registration and notifications while retaining scoped history", async () => {
    const s = await setup();
    const guest = await s.actor("retained-guest");
    const receipt = await s.registrations.register(
      guest,
      s.event.id,
      s.response(),
    );
    const sendSubmissionNotification = vi.fn().mockResolvedValue(undefined);
    const runner = new FormNotificationRunner(
      s.db,
      { sendSubmissionNotification },
      "http://127.0.0.1:4100",
    );
    await expect(s.change("forms", "disable")).rejects.toMatchObject({
      code: "EVENT_DEPENDENTS_ACTIVE",
    });
    await s.change("forms", "disable", true);
    await expect(
      s.registrations.publicForm(guest, s.event.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      s.registrations.register(guest, s.event.id, s.response()),
    ).rejects.toMatchObject({ status: 404 });
    expect((await runner.runBatch()).processed).toBe(0);
    expect(sendSubmissionNotification).not.toHaveBeenCalled();
    expect((await s.registrations.mine(guest))[0].status).toBe("confirmed");
    expect((await s.submissions.detail(s.manager, receipt.id)).id).toBe(
      receipt.id,
    );
    await s.change("forms", "enable");
    expect((await runner.runBatch()).processed).toBe(0);
    await s.change("registration", "enable");
    expect((await runner.runBatch()).sent).toBe(0);
    // Re-enabling features preserves history but cannot revive old delivery.
    // A scoped operator can explicitly review and retry the retained response.
    await s.submissions.retryNotification(s.manager, receipt.id);
    expect((await runner.runBatch()).sent).toBe(1);
    expect((await runner.runBatch()).sent).toBe(0);
    await s.change("website", "disable", true);
    await s.registrations.cancel(guest, receipt.registration.id, {
      confirmed: true,
    });
    expect(
      (await s.registrations.workspace(s.manager, s.event.id)).confirmedCount,
    ).toBe(0);
    const [total] = await s.db
      .select({ value: count() })
      .from(formSubmission)
      .where(
        and(
          eq(formSubmission.formId, s.form.id),
          eq(formSubmission.organizationId, s.scope.organizationId),
        ),
      );
    expect(total.value).toBe(1);
    // Database ownership is composite, not an unchecked form ID in settings.
    const other = await s.events.create(s.owner, {
      ...fields,
      managerUserId: s.owner.userId,
    });
    await expect(
      s.db.insert(registrationSettings).values({
        eventId: other.id,
        organizationId: s.scope.organizationId,
        authority: "native",
        formId: s.form.id,
      }),
    ).rejects.toThrow();
  });
}
