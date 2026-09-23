import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { FeatureService } from "../../src/core/features/FeatureService";
import { membership } from "../../db/schema/club";
import { clubEvent } from "../../db/schema/events";
import { lumaConnection } from "../../db/schema/integrations";
import { registrationSettings } from "../../db/schema/registrations";
import { eventFieldsSchema } from "../../src/features/events/event_schemas";
import { lumaApiEvent, lumaGuestProjection } from "../../db/schema/luma-sync";
import { lumaReconciliationJob as jobs } from "../../db/schema/luma-jobs";
import {
  type Context,
  fixture,
  setup,
  confirm,
  guest,
} from "./luma-sync-fixture";

export function lumaJobChecks(get: () => Context) {
  async function ready() {
    const provider = await fixture();
    try {
      const s = await setup(get(), provider.client);
      await s.link();
      const enqueue = async () => {
        const state = await s.api.workspace(s.manager, s.event.id);
        const input = { ...confirm(state.version), requestId: randomUUID() };
        const history = await s.jobs.enqueue(s.manager, s.event.id, input);
        return { input, job: history[0] };
      };
      const due = async () => {
        await s.elapsed();
        await s.db
          .update(jobs)
          .set({ availableAt: new Date(0) })
          .where(and(eq(jobs.eventId, s.event.id), eq(jobs.status, "pending")));
      };
      return { ...s, provider, enqueue, due };
    } catch (error) {
      await provider.close();
      throw error;
    }
  }

  it("C08 never restarts old reconciliation work after the club Events feature is disabled and enabled", async () => {
    const s = await ready();
    try {
      const features = new FeatureService(s.db, get().authorization);
      await s.enqueue();
      const before = s.provider.calls();
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
      expect((await s.runner().runBatch()).cancelled).toBe(1);
      expect(s.provider.calls()).toBe(before);
      expect(await s.db.select().from(lumaGuestProjection)).toHaveLength(0);
      expect((await s.jobs.history(s.manager, s.event.id))[0].status).toBe(
        "cancelled",
      );
    } finally {
      await s.provider.close();
    }
  });

  it("C08 queues one reviewed job, rejects replay conflicts and executes once across fresh concurrent runners", async () => {
    const s = await ready();
    try {
      const unassigned = await get().actor("job-unassigned");
      await expect(s.jobs.history(unassigned, s.event.id)).rejects.toThrow();
      const calls = s.provider.calls();
      const { input, job } = await s.enqueue();
      expect(s.provider.calls()).toBe(calls);
      expect(await s.db.select().from(lumaGuestProjection)).toHaveLength(0);
      expect((await s.jobs.enqueue(s.manager, s.event.id, input))[0].id).toBe(
        job.id,
      );
      await expect(
        s.jobs.enqueue(s.manager, s.event.id, {
          ...input,
          expectedVersion: input.expectedVersion + 1,
        }),
      ).rejects.toMatchObject({ code: "SYNC_REQUEST_CONFLICT" });
      await expect(s.enqueue()).rejects.toMatchObject({
        code: "SYNC_ALREADY_QUEUED",
      });
      await expect(
        s.jobs.enqueue(s.manager, s.event.id, { ...input, confirmed: false }),
      ).rejects.toThrow();
      const results = await Promise.all([
        s.runner().runBatch(),
        s.runner().runBatch(),
      ]);
      expect(results.reduce((sum, value) => sum + value.succeeded, 0)).toBe(1);
      const before = await s.db.select().from(lumaGuestProjection);
      expect(before).toHaveLength(2);
      expect((await s.runner().runBatch()).processed).toBe(0);
      expect(await s.db.select().from(lumaGuestProjection)).toEqual(before);
      const history = await s.jobs.history(s.manager, s.event.id);
      expect(history[0]).toMatchObject({ status: "succeeded", attempts: 1 });
      const response = JSON.stringify(history);
      for (const field of [
        "sessionId",
        "requestedBy",
        "connectionId",
        "leaseToken",
        "credential",
        "email",
      ])
        expect(response).not.toContain(field);
    } finally {
      await s.provider.close();
    }
  });

  it("C08 retries failed pages without partial writes and recovers expired leases with a bounded attempt count", async () => {
    const s = await ready();
    try {
      await s.reconcile();
      const before = await s.db.select().from(lumaGuestProjection);
      const { job } = await s.enqueue();
      expect((await s.runner().runBatch()).processed).toBe(0); // Existing provider cooldown is durable.
      await s.due();
      s.provider.mode("failure");
      expect((await s.runner().runBatch()).deferred).toBe(1);
      expect(await s.db.select().from(lumaGuestProjection)).toEqual(before);
      expect((await s.runner().runBatch()).processed).toBe(0);
      await s.due();
      // Explicit disposable job fixture: process stopped after claiming its second attempt.
      await s.db
        .update(jobs)
        .set({
          status: "processing",
          attempts: 2,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(0),
        })
        .where(eq(jobs.id, job.id));
      s.provider.mode("normal");
      expect((await s.runner().runBatch()).succeeded).toBe(1);
      const after = await s.db.select().from(lumaGuestProjection);
      expect(after.map((row) => row.id).sort()).toEqual(
        before.map((row) => row.id).sort(),
      );
      expect((await s.jobs.history(s.manager, s.event.id))[0]).toMatchObject({
        status: "succeeded",
        attempts: 3,
      });
      const next = await s.enqueue();
      await s.db
        .update(jobs)
        .set({
          status: "processing",
          attempts: 3,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(0),
        })
        .where(eq(jobs.id, next.job.id));
      const calls = s.provider.calls();
      expect((await s.runner().runBatch()).failed).toBe(1);
      expect(s.provider.calls()).toBe(calls);
      expect(await s.db.select().from(lumaGuestProjection)).toEqual(after);
    } finally {
      await s.provider.close();
    }
  });

  it.each([
    "event",
    "connection",
    "membership",
    "session",
    "registration",
    "module",
  ] as const)(
    "C08 cancels a stale %s job before provider reads",
    async (mode) => {
      const s = await ready();
      try {
        await s.enqueue();
        const calls = s.provider.calls();
        if (mode === "event")
          await s.events.save(s.manager, {
            ...eventFieldsSchema.strip().parse(s.fields),
            id: s.event.id,
            expectedVersion: s.event.version,
            title: "Revised local event",
          });
        if (mode === "connection")
          await s.db.update(lumaConnection).set({ version: 99 });
        if (mode === "membership")
          await s.db
            .update(membership)
            .set({ status: "suspended" })
            .where(eq(membership.userId, s.manager.userId));
        if (mode === "session") s.revokeSession();
        if (mode === "registration")
          await s.db.update(registrationSettings).set({ version: 99 });
        if (mode === "module") {
          let event = await s.events.detail(s.manager, s.event.id);
          event = await s.modules.change(s.manager, {
            id: event.id,
            ...confirm(event.version),
            key: "registration",
            operation: "disable",
            suspendDependents: false,
          });
          await s.modules.change(s.manager, {
            id: event.id,
            ...confirm(event.version),
            key: "registration",
            operation: "enable",
            suspendDependents: false,
          });
        }
        expect((await s.runner().runBatch()).cancelled).toBe(1);
        expect(s.provider.calls()).toBe(calls);
        expect(await s.db.select().from(lumaGuestProjection)).toHaveLength(0);
      } finally {
        await s.provider.close();
      }
    },
  );

  it("C08 cancellation and lease replacement fence an in-flight import without changing existing records", async () => {
    const s = await ready();
    try {
      await s.reconcile();
      const before = await s.db.select().from(lumaGuestProjection);
      for (const mode of ["cancel", "lease"] as const) {
        const { job } = await s.enqueue();
        await s.due();
        let release: (() => void) | undefined;
        s.provider.hold((response) => {
          release = () =>
            response.end(
              JSON.stringify({
                entries: [guest("gst-stale-worker")],
                has_more: false,
              }),
            );
        });
        const running = s.runner().runBatch();
        await expect.poll(() => Boolean(release)).toBe(true);
        if (mode === "cancel")
          await s.jobs.cancel(s.manager, s.event.id, {
            id: job.id,
            confirmed: true,
          });
        else
          await s.db
            .update(jobs)
            .set({
              leaseToken: randomUUID(),
              leaseExpiresAt: new Date(Date.now() + 60_000),
            })
            .where(eq(jobs.id, job.id));
        release!();
        await running;
        s.provider.hold(undefined);
        expect(await s.db.select().from(lumaGuestProjection)).toEqual(before);
        if (mode === "lease") {
          await s.jobs.cancel(s.manager, s.event.id, {
            id: job.id,
            confirmed: true,
          });
          expect((await s.runner().runBatch()).processed).toBe(0);
        }
      }
      expect((await s.db.select().from(clubEvent))[0].published).toEqual(
        expect.objectContaining({ description: "Local copy is authoritative" }),
      );
      expect((await s.db.select().from(lumaApiEvent))[0].enabled).toBe(true);
    } finally {
      await s.provider.close();
    }
  });
}
