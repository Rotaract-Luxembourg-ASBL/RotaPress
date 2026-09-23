import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { auditEntry, membership } from "../../db/schema/club";
import { lumaConnection } from "../../db/schema/integrations";
import type {
  AuthorizationService,
  TrustedActor,
  StaffAccess,
} from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import { CredentialCipher } from "../../src/integrations/luma/CredentialCipher";
import { LumaClient } from "../../src/integrations/luma/LumaClient";
import { LumaAvailabilityService } from "../../src/integrations/luma/LumaAvailabilityService";
import { LumaConnectionService } from "../../src/integrations/luma/LumaConnectionService";

type Context = {
  db: Database;
  authorization: AuthorizationService;
  club: () => Promise<{
    owner: TrustedActor;
    manager: TrustedActor;
    scope: StaffAccess;
  }>;
};
const syntheticKey = () => `synthetic-${randomBytes(24).toString("hex")}`;
const action = (version: number) => ({
  expectedVersion: version,
  confirmed: true,
});

async function fixture() {
  let calls = 0,
    authenticated = false;
  let behavior: (response: ServerResponse) => void = (response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({ id: "cal-synthetic", name: "Synthetic calendar" }),
    );
  };
  const server = createServer((request, response) => {
    calls++;
    authenticated =
      request.headers["x-luma-api-key"]?.toString().startsWith("synthetic-") ??
      false;
    if (request.url !== "/v1/calendars/get" || request.method !== "GET") {
      response.writeHead(404).end();
      return;
    }
    behavior(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture did not bind.");
  return {
    client: new LumaClient({
      mode: "fixture",
      origin: `http://127.0.0.1:${address.port}`,
    }),
    set: (next: typeof behavior) => {
      behavior = next;
    },
    counts: () => ({ calls, authenticated }),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export function lumaConnectionChecks(get: () => Context) {
  async function setup(client = new LumaClient({ mode: "blocked" })) {
    const { db, authorization, club } = get();
    const people = await club();
    const availability = new LumaAvailabilityService(db, authorization);
    const cipher = new CredentialCipher(randomBytes(32).toString("hex"));
    const service = new LumaConnectionService(
      db,
      authorization,
      availability,
      cipher,
      client,
    );
    return { ...people, db, authorization, availability, cipher, service };
  }
  async function elapsed(db: Database, organizationId: string) {
    await db
      .update(lumaConnection)
      .set({ attemptedAt: new Date(Date.now() - 61_000) })
      .where(eq(lumaConnection.organizationId, organizationId));
  }

  it("C08 encrypts credentials with scope authentication and never returns stored secrets", async () => {
    const { db, owner, manager, service, cipher, scope } = await setup();
    const key = syntheticKey();
    const save = { ...action(0), apiKey: key };
    await expect(service.workspace(manager)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(service.save(manager, save)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      service.save(owner, { ...save, confirmed: false }),
    ).rejects.toThrow();
    await expect(
      service.save({ ...owner, authenticatedAt: new Date(0) }, save),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    const saved = await service.save(owner, save);
    const [row] = await db.select().from(lumaConnection);
    expect(row.credential?.includes(key)).toBe(false);
    expect(JSON.stringify(saved).includes(key)).toBe(false);
    expect(saved).toMatchObject({
      state: "unchecked",
      hasCredential: true,
      mode: "blocked",
    });
    const context = `${scope.organizationId}:${row.id}`;
    expect(cipher.open(row.credential!, context) === key).toBe(true);
    expect(() => cipher.open(row.credential!, `${context}-other`)).toThrow();
    expect(() =>
      new CredentialCipher(randomBytes(32).toString("hex")).open(
        row.credential!,
        context,
      ),
    ).toThrow();
    const parts = row.credential!.split(".");
    parts[2] = "0".repeat(32);
    expect(() => cipher.open(parts.join("."), context)).toThrow();
    expect(() => new CredentialCipher().seal(key, context)).toThrow();
    expect(cipher.seal(key, context) === row.credential).toBe(false);
    await expect(service.save(owner, save)).rejects.toMatchObject({
      code: "CONNECTION_CHANGED",
    });
    await expect(
      service.check(owner, action(saved.version)),
    ).rejects.toMatchObject({ code: "LUMA_DISABLED" });
    await new LumaAvailabilityService(db, get().authorization).configure(
      owner,
      { ...action(0), enabled: true },
    );
    await expect(
      service.check(owner, action(saved.version)),
    ).rejects.toMatchObject({ code: "LIVE_CHECK_BLOCKED" });
    const replacement = await service.save(owner, {
      ...action(saved.version),
      apiKey: syntheticKey(),
    });
    const disconnected = await service.disconnect(
      owner,
      action(replacement.version),
    );
    expect(disconnected).toMatchObject({
      id: saved.id,
      state: "disconnected",
      hasCredential: false,
    });
    expect((await db.select().from(lumaConnection))[0].credential).toBeNull();
    expect(
      JSON.stringify(await db.select().from(auditEntry)).includes(key),
    ).toBe(false);
  });

  it("C08 checks a calendar over local HTTP, masks failures and pins identity across reconnect", async () => {
    const provider = await fixture();
    try {
      const { db, service, owner, scope, availability } = await setup(
        provider.client,
      );
      await availability.configure(owner, { ...action(0), enabled: true });
      let saved = await service.save(owner, {
        ...action(0),
        apiKey: syntheticKey(),
      });
      saved = await service.check(owner, action(saved.version));
      expect(saved).toMatchObject({
        state: "verified",
        calendarId: "cal-synthetic",
        mode: "fixture",
      });
      expect(provider.counts()).toEqual({ calls: 1, authenticated: true });
      await expect(
        service.check(owner, action(saved.version)),
      ).rejects.toMatchObject({ code: "CHECK_RATE_LIMITED" });
      provider.set((response) => {
        response.writeHead(401).end("private provider body");
      });
      await elapsed(db, scope.organizationId);
      saved = await service.check(owner, action(saved.version));
      expect(saved).toMatchObject({
        state: "failed",
        calendarId: "cal-synthetic",
      });
      expect(saved.message?.includes("private provider body")).toBe(false);
      expect(saved.lastSuccessAt).not.toBeNull();
      saved = await service.disconnect(owner, action(saved.version));
      saved = await service.save(owner, {
        ...action(saved.version),
        apiKey: syntheticKey(),
      });
      expect(saved.calendarId).toBe("cal-synthetic");
      provider.set((response) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ id: "cal-different" }));
      });
      await elapsed(db, scope.organizationId);
      saved = await service.check(owner, action(saved.version));
      expect(saved).toMatchObject({
        state: "failed",
        calendarId: "cal-synthetic",
      });
      expect(saved.message).toContain("different calendar");
    } finally {
      await provider.close();
    }
  });

  it("C08 fences disconnect, replacement, disablement and revoked authority during network I/O", async () => {
    const provider = await fixture();
    try {
      const { db, owner, service, availability, scope } = await setup(
        provider.client,
      );
      let allowed = await availability.configure(owner, {
        ...action(0),
        enabled: true,
      });
      let saved = await service.save(owner, {
        ...action(0),
        apiKey: syntheticKey(),
      });
      for (const operation of [
        "disconnect",
        "replace",
        "disable",
        "revoke",
      ] as const) {
        await elapsed(db, scope.organizationId);
        let release: (() => void) | undefined;
        provider.set((response) => {
          release = () => {
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ id: "cal-synthetic" }));
          };
        });
        const checking = service.check(owner, action(saved.version));
        const outcome = checking.then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await expect.poll(() => Boolean(release)).toBe(true);
        const current = await service.workspace(owner);
        if (operation === "disconnect")
          await service.disconnect(owner, action(current.version));
        if (operation === "replace")
          await service.save(owner, {
            ...action(current.version),
            apiKey: syntheticKey(),
          });
        if (operation === "disable")
          allowed = await availability.configure(owner, {
            ...action(allowed.version),
            enabled: false,
          });
        if (operation === "revoke")
          await db
            .update(membership)
            .set({ status: "suspended" })
            .where(eq(membership.userId, owner.userId));
        release!();
        const result = await outcome;
        if (operation === "disable") {
          expect(result).toMatchObject({ value: { state: "failed" } });
          allowed = await availability.configure(owner, {
            ...action(allowed.version),
            enabled: true,
          });
        } else
          expect(result).toMatchObject({
            error: {
              code:
                operation === "revoke" ? "ACCESS_DENIED" : "CONNECTION_CHANGED",
            },
          });
        if (operation === "revoke") {
          await db
            .update(membership)
            .set({ status: "approved" })
            .where(eq(membership.userId, owner.userId));
          await elapsed(db, scope.organizationId);
          expect((await service.workspace(owner)).state).toBe("interrupted");
        }
        saved = await service.workspace(owner);
        saved = await service.save(owner, {
          ...action(saved.version),
          apiKey: syntheticKey(),
        });
        expect(saved.state).toBe("unchecked");
      }
    } finally {
      await provider.close();
    }
  });

  it("C08 rejects redirects, oversized or malformed responses and provider errors without leaking payloads", async () => {
    const provider = await fixture();
    try {
      const key = syntheticKey();
      for (const [status, body, code] of [
        [429, "private body", "RATE_LIMITED"],
        [503, "private body", "PROVIDER_UNAVAILABLE"],
        [200, "not-json", "INVALID_RESPONSE"],
        [200, JSON.stringify({ id: "wrong" }), "INVALID_RESPONSE"],
        [200, "x".repeat(65_537), "INVALID_RESPONSE"],
      ] as const) {
        provider.set((response) => {
          response
            .writeHead(status, { "content-type": "application/json" })
            .end(body);
        });
        await expect(provider.client.check(key)).rejects.toMatchObject({
          code,
          message: code,
        });
      }
      const before = provider.counts().calls;
      provider.set((response) => {
        response.writeHead(302, { location: "/redirect-target" }).end();
      });
      await expect(provider.client.check(key)).rejects.toMatchObject({
        code: "REQUEST_FAILED",
      });
      expect(provider.counts().calls).toBe(before + 1);
      expect(
        () =>
          new LumaClient({ mode: "fixture", origin: "https://example.test" }),
      ).toThrow();
      expect(
        () =>
          new LumaClient({
            mode: "fixture",
            origin: "http://127.0.0.1:80/path",
          }),
      ).toThrow();
    } finally {
      await provider.close();
    }
  });
}
