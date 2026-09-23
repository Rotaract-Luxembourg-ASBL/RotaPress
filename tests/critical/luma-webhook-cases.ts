import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { FeatureService } from "../../src/core/features/FeatureService";
import { auditEntry, membership } from "../../db/schema/club";
import { lumaWebhook, lumaWebhookReceipt } from "../../db/schema/luma-webhooks";
import { lumaGuestProjection } from "../../db/schema/luma-sync";
import type {
  AuthorizationService,
  StaffAccess,
  TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import { CredentialCipher } from "../../src/integrations/luma/CredentialCipher";
import { LumaAvailabilityService } from "../../src/integrations/luma/LumaAvailabilityService";
import { LumaWebhookService } from "../../src/integrations/luma/LumaWebhookService";
import { verifyLumaWebhook } from "../../src/integrations/luma/LumaWebhookSignature";
import { webhookEventTypes } from "../../src/integrations/luma/webhook_schemas";

type Context = {
  db: Database;
  authorization: AuthorizationService;
  club: () => Promise<{
    owner: TrustedActor;
    manager: TrustedActor;
    scope: StaffAccess;
  }>;
};
const action = (expectedVersion: number) => ({
  expectedVersion,
  confirmed: true,
});
function signed(
  secret: string,
  body: Buffer,
  timestamp = Math.floor(Date.now() / 1000),
) {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex")}`;
}
const payload = () =>
  Buffer.from(
    JSON.stringify({
      type: "guest.updated",
      data: {
        event: { id: "evt-synthetic-webhook" },
        user_email: "synthetic-private@example.test",
        approval_status: "approved",
        payment: { amount: 100, eligible: true },
      },
    }),
  );

export function lumaWebhookChecks(get: () => Context) {
  async function setup() {
    const { db, authorization, club } = get();
    const people = await club();
    const cipher = new CredentialCipher(randomBytes(32).toString("hex"));
    const availability = new LumaAvailabilityService(db, authorization);
    const service = new LumaWebhookService(
      db,
      authorization,
      availability,
      cipher,
      "http://127.0.0.1:4100",
    );
    return { ...people, db, cipher, availability, service };
  }
  async function enabled() {
    const current = await setup();
    const { owner, service, availability } = current;
    await availability.configure(owner, { ...action(0), enabled: true });
    const generated = await service.configure(owner, "generate", action(0));
    const secret = `whsec_${randomBytes(32).toString("base64")}`;
    const saved = await service.configure(owner, "save", {
      ...action(generated.version),
      secret,
      eventTypes: [...webhookEventTypes],
    });
    const id = new URL(saved.callbackUrl!).pathname.split("/").at(-1)!;
    return { ...current, saved, id, secret };
  }

  it("C08 pauses webhook reception with the club Events feature while preserving its connection", async () => {
    const s = await enabled();
    const features = new FeatureService(s.db, get().authorization);
    const before = await s.db.select().from(lumaWebhook);
    const body = payload();
    await features.configure(s.owner, {
      key: "events",
      enabled: false,
      expectedVersion: 0,
      confirmed: true,
    });
    expect((await s.service.workspace(s.owner)).allowed).toBe(false);
    await expect(
      s.service.receive(s.id, signed(s.secret, body), body),
    ).rejects.toMatchObject({ code: "WEBHOOK_PAUSED" });
    expect(await s.db.select().from(lumaWebhookReceipt)).toHaveLength(0);
    await features.configure(s.owner, {
      key: "events",
      enabled: true,
      expectedVersion: 1,
      confirmed: true,
    });
    await expect(
      s.service.receive(s.id, signed(s.secret, body), body),
    ).resolves.toBeDefined();
    expect(await s.db.select().from(lumaWebhook)).toEqual(before);
  });

  it("C08 protects webhook generation, secrets, scope and reviewed changes", async () => {
    const { db, owner, manager, cipher, availability, service } = await setup();
    await expect(service.workspace(manager)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      service.configure(manager, "generate", action(0)),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      service.configure(owner, "generate", { ...action(0), confirmed: false }),
    ).rejects.toThrow();
    await expect(
      service.configure(
        { ...owner, authenticatedAt: new Date(0) },
        "generate",
        action(0),
      ),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    const draft = await service.configure(owner, "generate", action(0));
    expect(draft).toMatchObject({
      enabled: false,
      hasSecret: false,
      localOnly: true,
    });
    const secret = `whsec_${randomBytes(32).toString("hex")}`;
    const values = {
      ...action(draft.version),
      secret,
      eventTypes: ["guest.updated"],
    };
    await expect(
      service.configure(owner, "save", values),
    ).rejects.toMatchObject({ code: "LUMA_DISABLED" });
    await availability.configure(owner, { ...action(0), enabled: true });
    const saved = await service.configure(owner, "save", values);
    const [row] = await db.select().from(lumaWebhook);
    expect(
      JSON.stringify(saved).includes(secret) || row.secret!.includes(secret),
    ).toBe(false);
    expect(
      cipher.open(row.secret!, `${row.organizationId}:${row.id}:webhook`) ===
        secret,
    ).toBe(true);
    expect(() =>
      cipher.open(row.secret!, `${row.organizationId}:${row.id}`),
    ).toThrow();
    await expect(
      service.configure(owner, "save", values),
    ).rejects.toMatchObject({ code: "WEBHOOK_CHANGED" });
    const logs = await db.select().from(auditEntry);
    expect(JSON.stringify(logs).includes(secret)).toBe(false);
    await db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.userId, owner.userId));
    await expect(service.workspace(owner)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      service.configure(owner, "pause", action(saved.version)),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("C08 rejects forged, stale, future, cross-endpoint and malformed webhook deliveries", async () => {
    const { db, service, secret, id } = await enabled();
    const body = payload();
    // All signatures and asynchronous receives use one exact second. Otherwise
    // a +61 signature can enter the valid +60 window during earlier DB calls.
    const now = Math.floor(Date.now() / 1000) * 1000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      for (const timestamp of [now / 1000 - 300, now / 1000 + 60])
        expect(
          verifyLumaWebhook(secret, signed(secret, body, timestamp), body),
        ).toBe(true);
      for (const signature of [
        null,
        "invalid",
        signed("wrong-secret", body),
        signed(secret, body, Math.floor(Date.now() / 1000) - 301),
        signed(secret, body, Math.floor(Date.now() / 1000) + 61),
      ]) {
        await expect(
          service.receive(id, signature, body),
        ).rejects.toMatchObject({
          code: "WEBHOOK_SIGNATURE",
        });
      }
      await expect(
        service.receive(
          id,
          signed(secret, body),
          Buffer.from(body.toString() + " "),
        ),
      ).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE" });
      await expect(
        service.receive(randomUUID(), signed(secret, body), body),
      ).rejects.toMatchObject({ code: "WEBHOOK_UNKNOWN" });
      for (const invalid of [
        Buffer.from("{"),
        Buffer.from(
          JSON.stringify({
            type: "guest.updated",
            data: { event: { id: "invalid" } },
          }),
        ),
      ]) {
        await expect(
          service.receive(id, signed(secret, invalid), invalid),
        ).rejects.toMatchObject({ code: "WEBHOOK_PAYLOAD" });
      }
      await expect(
        service.receive(id, null, Buffer.alloc(262_145)),
      ).rejects.toMatchObject({ code: "WEBHOOK_TOO_LARGE" });
      expect(await db.select().from(lumaWebhookReceipt)).toHaveLength(0);
    } finally {
      clock.mockRestore();
    }
  });

  it("C08 persists duplicate-safe private notifications without importing guest or payment data", async () => {
    const { db, owner, service, secret, id } = await enabled();
    const body = payload();
    await Promise.all([
      service.receive(id, signed(secret, body), body),
      service.receive(id, signed(secret, body), body),
    ]);
    const rows = await db.select().from(lumaWebhookReceipt);
    expect(rows).toHaveLength(1);
    const workspace = await service.workspace(owner);
    expect(workspace.receipts).toHaveLength(1);
    const serialized = JSON.stringify({ rows, workspace });
    for (const privateValue of [
      "synthetic-private",
      "payment",
      "eligible",
      secret,
    ])
      expect(serialized.includes(privateValue)).toBe(false);
    expect(await db.select().from(lumaGuestProjection)).toHaveLength(0);
    const ignored = Buffer.from(
      JSON.stringify({ type: "calendar.person.subscribed", data: {} }),
    );
    await service.receive(id, signed(secret, ignored), ignored);
    expect(await db.select().from(lumaWebhookReceipt)).toHaveLength(1);
    // Pruning never removes current replay protection, and old notifications disappear from the inbox.
    await db
      .update(lumaWebhookReceipt)
      .set({ receivedAt: new Date(Date.now() - 31 * 86400_000) });
    expect((await service.workspace(owner)).receipts).toHaveLength(0);
    const update = Buffer.from(
      JSON.stringify({
        type: "event.updated",
        data: { id: "evt-synthetic-webhook" },
      }),
    );
    await service.receive(id, signed(secret, update), update);
    expect(await db.select().from(lumaWebhookReceipt)).toHaveLength(1);
  });

  it("C08 stops deliveries on pause, disable and removal, and rejects a replaced secret", async () => {
    const { db, owner, service, availability, secret, id, saved } =
      await enabled();
    const body = payload();
    const paused = await service.configure(
      owner,
      "pause",
      action(saved.version),
    );
    await expect(
      service.receive(id, signed(secret, body), body),
    ).rejects.toMatchObject({ code: "WEBHOOK_PAUSED" });
    const replacement = `whsec_${randomBytes(32).toString("hex")}`;
    const resumed = await service.configure(owner, "save", {
      ...action(paused.version),
      secret: replacement,
      eventTypes: ["guest.updated"],
    });
    await expect(
      service.receive(id, signed(secret, body), body),
    ).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE" });
    await service.receive(id, signed(replacement, body), body);
    await availability.configure(owner, { ...action(1), enabled: false });
    await expect(
      service.receive(id, signed(replacement, body), body),
    ).rejects.toMatchObject({ code: "WEBHOOK_PAUSED" });
    const removed = await service.configure(
      owner,
      "remove",
      action(resumed.version),
    );
    expect(removed).toMatchObject({ enabled: false, hasSecret: false });
    const [row] = await db.select().from(lumaWebhook);
    expect(row.secret).toBeNull();
    expect(await db.select().from(lumaWebhookReceipt)).toHaveLength(1);
  });
}
