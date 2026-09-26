import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { automationProposal } from "../../db/schema/automation-review";
import { auditEntry, membership } from "../../db/schema/club";
import { eventRegistration } from "../../db/schema/registrations";
import type {
  AuthorizationService,
  StaffAccess,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import type { EventService } from "../../src/features/events/EventService";
import { EventModuleService } from "../../src/features/events/EventModuleService";
import { RegistrationService } from "../../src/features/events/RegistrationService";
import { FormService } from "../../src/features/forms/FormService";
import { MembershipService } from "../../src/features/members/MembershipService";
import { AutomationProposalService } from "../../src/integrations/automation/AutomationProposalService";
import type { AutomationPrincipal } from "../../src/integrations/automation/AutomationAccess";

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

/** Uses the existing events suite's isolated PostgreSQL lifecycle, never a new database reset. */
export function automationProposalChecks(get: () => Context) {
  async function setup() {
    const ctx = get();
    const people = await ctx.club();
    const forms = new FormService(ctx.db, ctx.authorization);
    const registrations = new RegistrationService(
      ctx.db,
      ctx.authorization,
      new MembershipService(ctx.db, ctx.authorization, forms),
    );
    const eventModules = new EventModuleService(ctx.db, ctx.events);
    const proposals = new AutomationProposalService(ctx.db, {
      authorization: ctx.authorization,
      events: ctx.events,
      registrations,
      eventModules,
    });
    let event = await ctx.events.create(people.owner, {
      title: "Synthetic AI event setup",
      description: "Private proposal fixture",
      startsAt: "2030-06-12T14:00:00Z",
      endsAt: null,
      timezone: "Europe/Luxembourg",
      venue: "Synthetic venue",
      visibility: "private",
      managerUserId: people.manager.userId,
    });
    for (const key of ["website", "forms", "registration"] as const) {
      event = await eventModules.change(people.owner, {
        id: event.id,
        key,
        expectedVersion: event.version,
        operation: "enable",
        confirmed: true,
      });
    }
    const form = await forms.createEventForm(people.owner, event.id, {
      kind: "registration",
      title: "Synthetic registration draft",
    });
    const principal: AutomationPrincipal = {
      actor: people.owner,
      keyId: "synthetic-service-boundary",
      organizationId: people.scope.organizationId,
      scopes: ["events:prepare"],
      sourceOrigins: [],
    };
    const feature = () => ({
      eventId: event.id,
      requestId: randomUUID(),
      proposal: {
        kind: "feature" as const,
        settings: {
          expectedVersion: event.version,
          key: "gallery" as const,
          operation: "enable" as const,
          suspendDependents: false,
        },
      },
    });
    const registration = () => ({
      eventId: event.id,
      requestId: randomUUID(),
      proposal: {
        kind: "registration" as const,
        settings: {
          expectedVersion: 0,
          authority: "native" as const,
          formId: form.id,
          capacity: 30,
          open: false,
        },
      },
    });
    const review = (id: string, action: "apply" | "reject" = "apply") => ({
      id,
      action,
      confirmed: true,
    });
    const stored = async (id: string) => {
      const [row] = await ctx.db
        .select()
        .from(automationProposal)
        .where(eq(automationProposal.id, id));
      return row;
    };
    return {
      ...ctx,
      ...people,
      forms,
      registrations,
      eventModules,
      proposals,
      event,
      form,
      principal,
      feature,
      registration,
      review,
      stored,
    };
  }

  describe("C14 automation proposals", () => {
    it("denies missing grants, forged club scope, nonstaff and stale human authority", async () => {
      const s = await setup();
      await expect(
        s.proposals.create(
          { ...s.principal, scopes: ["events:read"] },
          s.feature(),
        ),
      ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
      await expect(
        s.proposals.create(
          { ...s.principal, organizationId: randomUUID() },
          s.feature(),
        ),
      ).rejects.toMatchObject({ code: "AUTOMATION_ORGANIZATION_CHANGED" });
      await expect(
        s.proposals.create({ ...s.principal, actor: s.manager }, s.feature()),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      await expect(
        s.proposals.create(s.principal, {
          ...s.feature(),
          organizationId: s.scope.organizationId,
        }),
      ).rejects.toThrow();
      await expect(
        s.proposals.create(s.principal, {
          ...s.feature(),
          eventId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
      expect(await s.db.select().from(automationProposal)).toHaveLength(0);
      const proposal = await s.proposals.create(s.principal, s.feature());
      await expect(
        s.proposals.list(s.manager, s.event.id),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      await expect(
        s.proposals.review(s.manager, s.review(proposal.id)),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      await expect(
        s.proposals.review(
          { ...s.owner, authenticatedAt: new Date(Date.now() - 20 * 60_000) },
          s.review(proposal.id),
        ),
      ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
      await expect(
        s.proposals.review(s.owner, {
          ...s.review(proposal.id),
          confirmed: false,
        }),
      ).rejects.toThrow();
      await expect(
        s.proposals.review(s.owner, {
          ...s.review(proposal.id),
          eventId: s.event.id,
        }),
      ).rejects.toThrow();
      await s.db
        .update(membership)
        .set({ status: "suspended" })
        .where(eq(membership.userId, s.owner.userId));
      await expect(
        s.proposals.review(s.owner, s.review(proposal.id)),
      ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      expect((await s.stored(proposal.id)).status).toBe("pending");
    });

    it("serializes identical retries into one immutable suggestion without changing event settings", async () => {
      const s = await setup();
      const beforeModules = await s.eventModules.states(
        s.scope.organizationId,
        s.event.id,
      );
      const beforeRegistration = await s.registrations.workspace(
        s.owner,
        s.event.id,
      );
      const input = s.feature();
      const [a, b] = await Promise.all([
        s.proposals.create(s.principal, input),
        s.proposals.create(s.principal, input),
      ]);
      expect(a).toEqual(b);
      expect(a.status).toBe("pending");
      expect(a.reviewedAt).toBeNull();
      expect(a).not.toHaveProperty("createdBy");
      expect(a).not.toHaveProperty("inputHash");
      expect(await s.db.select().from(automationProposal)).toHaveLength(1);
      await expect(
        s.proposals.create(s.principal, {
          ...input,
          proposal: {
            ...input.proposal,
            settings: { ...input.proposal.settings, key: "sponsors" },
          },
        }),
      ).rejects.toMatchObject({ code: "AUTOMATION_PROPOSAL_CONFLICT" });
      expect((await s.stored(a.id)).payload).toEqual(input.proposal);
      expect(
        await s.eventModules.states(s.scope.organizationId, s.event.id),
      ).toEqual(beforeModules);
      expect(await s.registrations.workspace(s.owner, s.event.id)).toEqual(
        beforeRegistration,
      );
      expect((await s.events.detail(s.owner, s.event.id)).version).toBe(
        s.event.version,
      );
      expect((await s.events.detail(s.owner, s.event.id)).published).toBe(
        false,
      );
      expect(await s.db.select().from(eventRegistration)).toHaveLength(0);
    });

    it("applies one feature change and its receipt atomically and treats duplicate approvals idempotently", async () => {
      const s = await setup();
      const input = s.feature();
      const pending = await s.proposals.create(s.principal, input);
      const [first, second] = await Promise.all([
        s.proposals.review(s.owner, s.review(pending.id)),
        s.proposals.review(s.owner, s.review(pending.id)),
      ]);
      expect(first).toEqual(second);
      expect(first.status).toBe("applied");
      expect(first.reviewedAt).not.toBeNull();
      const stored = await s.stored(pending.id);
      expect(stored.payload).toEqual(input.proposal);
      expect(stored.reviewedBy).toBe(s.owner.userId);
      expect((await s.events.detail(s.owner, s.event.id)).version).toBe(
        s.event.version + 1,
      );
      expect(
        (await s.eventModules.states(s.scope.organizationId, s.event.id)).find(
          (item) => item.key === "gallery",
        )?.state,
      ).toBe("enabled");
      expect(
        await s.db
          .select()
          .from(auditEntry)
          .where(
            and(
              eq(auditEntry.targetId, pending.id),
              eq(auditEntry.action, "automation.proposal.applied"),
            ),
          ),
      ).toHaveLength(1);
      expect(await s.proposals.create(s.principal, input)).toEqual(first);
      await expect(
        s.proposals.review(s.owner, s.review(pending.id, "reject")),
      ).rejects.toMatchObject({ code: "AUTOMATION_PROPOSAL_REVIEWED" });
      expect((await s.events.detail(s.owner, s.event.id)).published).toBe(
        false,
      );
    });

    it("keeps stale feature suggestions pending and rejects without changing configuration", async () => {
      const s = await setup();
      const pending = await s.proposals.create(s.principal, s.feature());
      await s.eventModules.change(s.owner, {
        id: s.event.id,
        key: "sponsors",
        operation: "enable",
        expectedVersion: s.event.version,
        confirmed: true,
      });
      const before = await s.eventModules.states(
        s.scope.organizationId,
        s.event.id,
      );
      await expect(
        s.proposals.review(s.owner, s.review(pending.id)),
      ).rejects.toMatchObject({ code: "EVENT_CONFLICT" });
      expect((await s.stored(pending.id)).status).toBe("pending");
      const rejected = await s.proposals.review(
        s.owner,
        s.review(pending.id, "reject"),
      );
      expect(rejected.status).toBe("rejected");
      expect(
        await s.proposals.review(s.owner, s.review(pending.id, "reject")),
      ).toEqual(rejected);
      expect(
        await s.eventModules.states(s.scope.organizationId, s.event.id),
      ).toEqual(before);
      await expect(
        s.proposals.review(s.owner, s.review(pending.id)),
      ).rejects.toMatchObject({ code: "AUTOMATION_PROPOSAL_REVIEWED" });
    });

    it("applies closed native registration through the shared transaction without publishing a form or registering anyone", async () => {
      const s = await setup();
      const input = s.registration();
      const pending = await s.proposals.create(s.principal, input);
      expect(
        (await s.registrations.workspace(s.owner, s.event.id)).authority,
      ).toBe("none");
      const result = await s.proposals.review(s.owner, s.review(pending.id));
      expect(result.status).toBe("applied");
      expect(
        await s.registrations.workspace(s.owner, s.event.id),
      ).toMatchObject({
        authority: "native",
        version: 1,
        formId: s.form.id,
        capacity: 30,
        open: false,
        confirmedCount: 0,
      });
      expect(await s.proposals.review(s.owner, s.review(pending.id))).toEqual(
        result,
      );
      expect(
        (await s.registrations.workspace(s.owner, s.event.id)).version,
      ).toBe(1);
      expect(
        (await s.forms.detail(s.owner, s.form.id)).publishedVersionId,
      ).toBeNull();
      expect(await s.db.select().from(eventRegistration)).toHaveLength(0);
      expect((await s.stored(pending.id)).payload).toEqual(input.proposal);
    });

    it("leaves stale registration proposals pending and preserves the newer operational settings", async () => {
      const s = await setup();
      const input = s.registration();
      const pending = await s.proposals.create(s.principal, input);
      await s.registrations.configure(s.owner, s.event.id, {
        ...input.proposal.settings,
        capacity: 12,
        confirmed: true,
      });
      const before = await s.registrations.workspace(s.owner, s.event.id);
      await expect(
        s.proposals.review(s.owner, s.review(pending.id)),
      ).rejects.toMatchObject({ code: "REGISTRATION_SETTINGS_CHANGED" });
      expect((await s.stored(pending.id)).status).toBe("pending");
      expect(await s.registrations.workspace(s.owner, s.event.id)).toEqual(
        before,
      );
      expect(
        (await s.proposals.review(s.owner, s.review(pending.id, "reject")))
          .status,
      ).toBe("rejected");
      expect(await s.registrations.workspace(s.owner, s.event.id)).toEqual(
        before,
      );
    });

    it("rolls back both domain writes and receipt changes when review fails after the real mutation", async () => {
      const s = await setup();
      const feature = await s.proposals.create(s.principal, s.feature());
      const registration = await s.proposals.create(
        s.principal,
        s.registration(),
      );
      const beforeModules = await s.eventModules.states(
        s.scope.organizationId,
        s.event.id,
      );
      const beforeRegistration = await s.registrations.workspace(
        s.owner,
        s.event.id,
      );
      const change = s.eventModules.change.bind(s.eventModules);
      const moduleFailure = vi
        .spyOn(s.eventModules, "change")
        .mockImplementation(async (...args) => {
          await change(...args);
          throw new Error("Synthetic failure after feature write");
        });
      try {
        await expect(
          s.proposals.review(s.owner, s.review(feature.id)),
        ).rejects.toThrow("Synthetic failure after feature write");
      } finally {
        moduleFailure.mockRestore();
      }
      const configure = s.registrations.configure.bind(s.registrations);
      const registrationFailure = vi
        .spyOn(s.registrations, "configure")
        .mockImplementation(async (...args) => {
          await configure(...args);
          throw new Error("Synthetic failure after registration write");
        });
      try {
        await expect(
          s.proposals.review(s.owner, s.review(registration.id)),
        ).rejects.toThrow("Synthetic failure after registration write");
      } finally {
        registrationFailure.mockRestore();
      }
      expect(
        await s.eventModules.states(s.scope.organizationId, s.event.id),
      ).toEqual(beforeModules);
      expect(await s.registrations.workspace(s.owner, s.event.id)).toEqual(
        beforeRegistration,
      );
      expect((await s.events.detail(s.owner, s.event.id)).version).toBe(
        s.event.version,
      );
      for (const id of [feature.id, registration.id]) {
        expect(await s.stored(id)).toMatchObject({
          status: "pending",
          reviewedBy: null,
          reviewedAt: null,
        });
        expect(
          await s.db
            .select()
            .from(auditEntry)
            .where(
              and(
                eq(auditEntry.targetId, id),
                eq(auditEntry.action, "automation.proposal.applied"),
              ),
            ),
        ).toHaveLength(0);
      }
    });
  });
}
