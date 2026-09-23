import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { membership } from "../../db/schema/club";
import { clubEvent, eventManager } from "../../db/schema/events";
import { lumaConnection, lumaEventLink } from "../../db/schema/integrations";
import {
  lumaApiEvent,
  lumaGuestProjection,
  lumaSyncRun,
} from "../../db/schema/luma-sync";
import { eventRegistration } from "../../db/schema/registrations";
import { cmsSite } from "../../db/schema/cms";
import { LumaClient } from "../../src/integrations/luma/LumaClient";
import {
  type Context,
  destination,
  confirm,
  syntheticKey,
  guest,
  fixture,
  setup as prepare,
} from "./luma-sync-fixture";
export function lumaSyncChecks(get: () => Context) {
  const setup = (client: LumaClient) => prepare(get(), client);
  it("C08 requires reviewed scoped management and matching API event/calendar/destination", async () => {
    const provider = await fixture();
    try {
      const s = await setup(provider.client);
      const editor = await get().actor("sync-editor"),
        registrar = await get().actor("sync-registrar");
      for (const [actor, role] of [
        [editor, "editor"],
        [registrar, "registration-manager"],
      ] as const) {
        await s.db.insert(membership).values({
          userId: actor.userId,
          organizationId: s.scope.organizationId,
          status: "approved",
          role: "member",
        });
        await s.db.insert(eventManager).values({
          eventId: s.event.id,
          organizationId: s.scope.organizationId,
          userId: actor.userId,
          role,
        });
      }
      await expect(s.api.workspace(editor, s.event.id)).rejects.toMatchObject({
        code: "EVENT_ACCESS_DENIED",
      });
      await expect(s.link(registrar)).rejects.toMatchObject({
        code: "EVENT_ACCESS_DENIED",
      });
      await expect(
        s.api.link(s.manager, s.event.id, {
          ...confirm(0),
          confirmed: false,
          providerEventId: "evt-sync",
        }),
      ).rejects.toThrow();
      for (const mode of ["view", "calendar", "url"]) {
        provider.mode(mode);
        await expect(s.link()).rejects.toMatchObject({
          code: mode === "view" ? "API_EVENT_CHECK_FAILED" : "EVENT_MISMATCH",
        });
        expect((await s.db.select().from(lumaApiEvent)).length).toBe(0);
      }
      provider.mode("normal");
      const before = JSON.stringify(await s.db.select().from(clubEvent));
      const site = JSON.stringify(await s.db.select().from(cmsSite));
      await s.link();
      await s.reconcile(randomUUID(), registrar);
      expect(JSON.stringify(await s.db.select().from(clubEvent))).toBe(before);
      expect(JSON.stringify(await s.db.select().from(cmsSite))).toBe(site);
      expect(await s.db.select().from(eventRegistration)).toHaveLength(0);
      const other = await s.events.create(s.owner, {
        ...s.fields,
        managerUserId: s.owner.userId,
      });
      await expect(s.api.workspace(s.manager, other.id)).rejects.toMatchObject({
        code: "EVENT_NOT_FOUND",
      });
      await expect(s.link()).rejects.toMatchObject({ code: "API_LINK_LOCKED" });
      expect(
        JSON.stringify(await s.api.workspace(s.manager, s.event.id)).includes(
          "synthetic-excluded",
        ),
      ).toBe(false);
    } finally {
      await provider.close();
    }
  });
  it("C08 retains the complete projection when the requesting session is revoked during import", async () => {
    const provider = await fixture();
    try {
      const s = await setup(provider.client);
      await s.link();
      await s.reconcile();
      const before = await s.db.select().from(lumaGuestProjection);
      await s.elapsed();
      let release: (() => void) | undefined;
      provider.hold((response) => {
        release = () =>
          response.end(
            JSON.stringify({
              entries: [guest("gst-revoked")],
              has_more: false,
            }),
          );
      });
      const pending = s.reconcile().catch((error: unknown) => error);
      await expect.poll(() => Boolean(release)).toBe(true);
      s.revokeSession();
      release!();
      expect(await pending).toMatchObject({ code: "SYNC_ACCESS_CHANGED" });
      expect(await s.db.select().from(lumaGuestProjection)).toEqual(before);
    } finally {
      await provider.close();
    }
  });
  it("C08 reconciles pagination/replay atomically and retains missing or failed-page history", async () => {
    const provider = await fixture();
    try {
      const s = await setup(provider.client);
      await s.link();
      const first = await s.reconcile();
      expect(first.runs[0]).toMatchObject({
        status: "succeeded",
        guestCount: 2,
      });
      const originals = await s.db.select().from(lumaGuestProjection);
      const calls = provider.calls();
      await s.sync.reconcile(s.manager, s.event.id, first.input);
      expect(provider.calls()).toBe(calls);
      expect(await s.db.select().from(lumaGuestProjection)).toEqual(originals);
      await expect(s.reconcile()).rejects.toMatchObject({
        code: "SYNC_RATE_LIMITED",
      });
      provider.mode("failure");
      await s.elapsed();
      expect((await s.reconcile()).runs[0].status).toBe("failed");
      expect(await s.db.select().from(lumaGuestProjection)).toEqual(originals);
      provider.mode("missing");
      await s.elapsed();
      await s.reconcile();
      let records = await s.db.select().from(lumaGuestProjection);
      expect(records).toHaveLength(2);
      expect(
        records.find((r) => r.providerGuestId === "gst-one"),
      ).toMatchObject({ approvalStatus: "declined", present: true });
      expect(
        records.find((r) => r.providerGuestId === "gst-two"),
      ).toMatchObject({ present: false });
      provider.mode("normal");
      let connection = await s.connection.workspace(s.owner);
      connection = await s.connection.disconnect(
        s.owner,
        confirm(connection.version),
      );
      expect((await s.api.workspace(s.manager, s.event.id)).available).toBe(
        false,
      );
      expect(await s.db.select().from(lumaGuestProjection)).toEqual(records);
      connection = await s.connection.save(s.owner, {
        ...confirm(connection.version),
        apiKey: syntheticKey(),
      });
      await s.db.update(lumaConnection).set({ attemptedAt: new Date(0) });
      await s.connection.check(s.owner, confirm(connection.version));
      await s.elapsed();
      await s.reconcile();
      records = await s.db.select().from(lumaGuestProjection);
      expect(records.map((r) => r.id).sort()).toEqual(
        originals.map((r) => r.id).sort(),
      );
      expect(records.every((r) => r.present)).toBe(true);
    } finally {
      await provider.close();
    }
  });
  it("C08 refuses invalid/repeated pagination and bounded imports without partial writes", async () => {
    const provider = await fixture();
    try {
      const s = await setup(provider.client);
      await s.link();
      await s.reconcile();
      const before = await s.db.select().from(lumaGuestProjection);
      for (const mode of ["cycle", "malformed", "large"]) {
        provider.mode(mode);
        await s.elapsed();
        expect((await s.reconcile()).runs[0].status).toBe("failed");
        expect(await s.db.select().from(lumaGuestProjection)).toEqual(before);
      }
    } finally {
      await provider.close();
    }
  });
  it("C08 fences disablement, connection replacement, revocation and unpublication during reconciliation", async () => {
    const provider = await fixture();
    try {
      const s = await setup(provider.client);
      await s.link();
      await s.reconcile();
      const before = await s.db.select().from(lumaGuestProjection);
      for (const mode of [
        "api",
        "module",
        "connection",
        "membership",
        "publication",
      ] as const) {
        await s.elapsed();
        let release: (() => void) | undefined;
        provider.hold((res) => {
          release = () =>
            res.end(
              JSON.stringify({
                entries: [guest("gst-changed")],
                has_more: false,
              }),
            );
        });
        const pending = s.reconcile().then(
          () => true,
          () => false,
        );
        await expect.poll(() => Boolean(release)).toBe(true);
        if (mode === "api")
          await s.api.configure(s.manager, s.event.id, {
            ...confirm((await s.api.workspace(s.manager, s.event.id)).version),
            enabled: false,
          });
        if (mode === "module")
          await s.modules.change(s.manager, {
            id: s.event.id,
            ...confirm((await s.events.detail(s.manager, s.event.id)).version),
            key: "registration",
            operation: "disable",
            suspendDependents: false,
          });
        if (mode === "connection")
          await s.connection.disconnect(
            s.owner,
            confirm((await s.connection.workspace(s.owner)).version),
          );
        if (mode === "membership")
          await s.db
            .update(membership)
            .set({ status: "suspended" })
            .where(eq(membership.userId, s.manager.userId));
        if (mode === "publication")
          await s.db
            .update(clubEvent)
            .set({ publishedAt: null, published: null })
            .where(eq(clubEvent.id, s.event.id));
        release!();
        await pending;
        provider.hold(undefined);
        expect(await s.db.select().from(lumaGuestProjection)).toEqual(before);
        if (mode === "membership")
          await s.db
            .update(membership)
            .set({ status: "approved" })
            .where(eq(membership.userId, s.manager.userId));
        if (mode === "publication")
          await s.db
            .update(clubEvent)
            .set({ publishedAt: new Date(), published: s.fields })
            .where(eq(clubEvent.id, s.event.id));
        if (mode === "connection") {
          const state = await s.connection.workspace(s.owner);
          const saved = await s.connection.save(s.owner, {
            ...confirm(state.version),
            apiKey: syntheticKey(),
          });
          await s.db.update(lumaConnection).set({ attemptedAt: new Date(0) });
          await s.connection.check(s.owner, confirm(saved.version));
        }
        if (mode === "module")
          await s.modules.change(s.manager, {
            id: s.event.id,
            ...confirm((await s.events.detail(s.manager, s.event.id)).version),
            key: "registration",
            operation: "enable",
            suspendDependents: false,
          });
        if (mode === "api")
          await s.api.configure(s.manager, s.event.id, {
            ...confirm((await s.api.workspace(s.manager, s.event.id)).version),
            enabled: true,
          });
      }
      expect(
        (await s.db.select().from(lumaSyncRun)).filter(
          (r) => r.status === "running",
        ),
      ).toHaveLength(0);
      const publicLink = (await s.db.select().from(lumaEventLink))[0];
      expect(publicLink.publishedUrl).toBe(destination);
    } finally {
      await provider.close();
    }
  });
}
