import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { ensureIntegrationKey } from "../../scripts/runtime_environment.mjs";
import { parseEnv } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { user } from "../../db/schema/auth";
import { auditEntry, membership } from "../../db/schema/club";
import { googleAuthConfiguration } from "../../db/schema/google-auth";
import { GoogleAuthSettingsService } from "../../src/core/auth/GoogleAuthSettingsService";
import { GoogleAuthStore } from "../../src/core/auth/GoogleAuthStore";
import {
  AuthorizationService,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { OrganizationService } from "../../src/core/organization/OrganizationService";
import type { Database } from "../../src/infrastructure/database/client";
import { CredentialCipher } from "../../src/infrastructure/security/CredentialCipher";

let runtimePool: Pool;
let migrationPool: Pool;
let db: Database;
let authorization: AuthorizationService;
const appUrl = "http://127.0.0.1:3000";
const credentials = () => ({
  clientId: `123456789012-synthetic-${randomBytes(8).toString("hex")}.apps.googleusercontent.com`,
  clientSecret: `GOCSPX-${randomBytes(24).toString("hex")}`,
});
const action = (expectedVersion: number) => ({
  expectedVersion,
  confirmed: true,
});

function testConnection(value: string | undefined) {
  if (!value) throw new Error("Run setup before critical checks.");
  const target = new URL(value);
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  )
    throw new Error(
      "Google settings checks require the disposable local test database.",
    );
  return value;
}

async function actor(label: string): Promise<TrustedActor> {
  // Domain-service fixture only: no browser cookie, provider callback or auth session is fabricated.
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
  const owner = await actor("google-owner");
  const claim = randomBytes(32).toString("hex");
  await migrationPool.query(
    "INSERT INTO club.installation (id, nominated_email, claim_hash, claim_expires_at) VALUES (1, $1, $2, $3)",
    [
      owner.email,
      createHash("sha256").update(claim).digest("hex"),
      new Date(Date.now() + 60000),
    ],
  );
  await new InstallationService(db).complete(owner, {
    claim,
    name: "Synthetic Google Settings Club",
    tagline: "",
    description: "",
    locale: "en",
    timezone: "Europe/Luxembourg",
    accentColor: "#25636b",
  });
  return {
    owner,
    scope: await authorization.require(owner, "integrations.manage"),
  };
}

function services(key = randomBytes(32).toString("hex")) {
  const cipher = new CredentialCipher(key);
  const store = new GoogleAuthStore(db, cipher);
  const service = new GoogleAuthSettingsService(
    db,
    authorization,
    store,
    appUrl,
  );
  return { cipher, store, service };
}

function secretFree(value: object, secrets: string[]) {
  expect(Object.keys(value).includes("clientSecret")).toBe(false);
  for (const secret of secrets)
    expect(JSON.stringify(value).includes(secret)).toBe(false);
}

beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  runtimePool = new Pool({
    connectionString: testConnection(env.DATABASE_URL),
    max: 5,
  });
  migrationPool = new Pool({
    connectionString: testConnection(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  db = drizzle(runtimePool, { schema });
  authorization = new AuthorizationService(db);
});

beforeEach(async () => {
  await migrationPool.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
});

afterAll(async () => {
  await Promise.all([runtimePool?.end(), migrationPool?.end()]);
});

describe("C02 Google configuration and session revision boundaries", () => {
  it("limits mutations to the recent owner and rejects stale, malformed or browser-supplied scope", async () => {
    const { owner, scope } = await club();
    const { service } = services();
    const administrator = await actor("google-administrator");
    const editor = await actor("google-editor");
    const outsider = await actor("google-outsider");
    for (const [person, role] of [
      [administrator, "administrator"],
      [editor, "editor"],
    ] as const) {
      await db.insert(membership).values({
        organizationId: scope.organizationId,
        userId: person.userId,
        role,
        status: "approved",
      });
    }
    expect(await service.workspace(administrator)).toMatchObject({
      canManage: false,
    });
    for (const person of [editor, outsider])
      await expect(service.workspace(person)).rejects.toMatchObject({
        status: 403,
      });
    const credential = credentials();
    for (const person of [administrator, editor, outsider]) {
      await expect(
        service.save(person, { expectedVersion: 0, ...credential }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.setEnabled(person, { ...action(0), enabled: true }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(service.disconnect(person, action(0))).rejects.toMatchObject(
        { status: 403 },
      );
    }
    for (const authenticatedAt of [new Date(0), new Date(Date.now() + 60000)]) {
      await expect(
        service.save(
          { ...owner, authenticatedAt },
          { expectedVersion: 0, ...credential },
        ),
      ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    }
    for (const input of [
      {
        expectedVersion: 0,
        clientId: "not-a-google-client",
        clientSecret: credential.clientSecret,
      },
      {
        expectedVersion: 0,
        clientId: credential.clientId,
        clientSecret: "short",
      },
      { expectedVersion: 0, ...credential, organizationId: randomUUID() },
      { expectedVersion: 0, ...credential, enabled: true },
    ])
      await expect(service.save(owner, input)).rejects.toMatchObject({
        name: "ZodError",
      });
    const concurrent = await Promise.allSettled([
      service.save(owner, { expectedVersion: 0, ...credential }),
      service.save(owner, { expectedVersion: 0, ...credential }),
    ]);
    expect(
      concurrent.filter((result) => result.status === "fulfilled").length,
    ).toBe(1);
    const accepted = concurrent.find((result) => result.status === "fulfilled");
    const rejected = concurrent.find((result) => result.status === "rejected");
    if (!accepted || !rejected)
      throw new Error("Concurrent settings fixture did not serialize.");
    expect(rejected.reason).toMatchObject({
      code: "GOOGLE_CONFIGURATION_CHANGED",
    });
    const saved = accepted.value;
    secretFree(saved, [credential.clientSecret]);
    expect(saved).toMatchObject({
      version: 1,
      enabled: false,
      hasSecret: true,
      canManage: true,
      verifiedAt: null,
      origin: appUrl,
      callbackUrl: `${appUrl}/api/auth/callback/google`,
    });
    for (const mutate of [
      () => service.save(owner, { expectedVersion: 0, ...credential }),
      () => service.setEnabled(owner, { ...action(0), enabled: true }),
      () => service.disconnect(owner, action(0)),
    ])
      await expect(mutate()).rejects.toMatchObject({ status: 409 });
    expect((await service.workspace(owner)).version).toBe(saved.version);
  });

  it("encrypts scoped credentials and prevents credential or lifecycle changes while staff require Google", async () => {
    const { owner, scope } = await club();
    const { cipher, store, service } = services();
    const credential = credentials();
    let saved = await service.save(owner, {
      expectedVersion: 0,
      ...credential,
    });
    const [row] = await db.select().from(googleAuthConfiguration);
    expect(row.clientSecret === credential.clientSecret).toBe(false);
    expect(row.clientSecret?.includes(credential.clientSecret)).toBe(false);
    expect(
      cipher.open(row.clientSecret!, `google-auth:${scope.organizationId}`) ===
        credential.clientSecret,
    ).toBe(true);
    expect(() =>
      cipher.open(row.clientSecret!, `google-auth:${randomUUID()}`),
    ).toThrow();
    expect((await store.runtime()) === null).toBe(true);
    saved = await service.setEnabled(owner, {
      ...action(saved.version),
      enabled: true,
    });
    const runtime = await store.runtime();
    expect(runtime?.clientSecret === credential.clientSecret).toBe(true);
    expect(runtime?.clientId === credential.clientId).toBe(true);
    const wrongKey = services();
    expect(await wrongKey.store.enabled()).toBe(false);
    expect(await wrongKey.store.accepts(runtime!.version)).toBe(false);
    await store.markVerified(runtime!.version);
    secretFree(await service.workspace(owner), [credential.clientSecret]);
    expect(
      JSON.stringify(await db.select().from(auditEntry)).includes(
        credential.clientSecret,
      ),
    ).toBe(false);
    await expect(
      runtimePool.query(
        "INSERT INTO club.google_auth_configuration (organization_id) VALUES ($1)",
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const organizationService = new OrganizationService(
      db,
      authorization,
      store,
    );
    const identity = await organizationService.settings(owner);
    // Trusted domain input exercises policy only; no synthetic Google auth session is inserted.
    const staleGoogleOwner: TrustedActor = {
      ...owner,
      authMethod: "google",
      authProviderVersion: runtime!.version,
    };
    saved = await service.save(owner, {
      expectedVersion: saved.version,
      ...credentials(),
    });
    saved = await service.setEnabled(owner, {
      ...action(saved.version),
      enabled: true,
    });
    await expect(
      service.save(staleGoogleOwner, {
        expectedVersion: saved.version,
        ...credentials(),
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_SESSION_REQUIRED" });
    await expect(
      organizationService.update(staleGoogleOwner, {
        ...identity,
        staffAuthPolicy: "google",
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_SESSION_REQUIRED" });
    const currentRuntime = await store.runtime();
    const googleOwner: TrustedActor = {
      ...owner,
      authMethod: "google",
      authProviderVersion: currentRuntime!.version,
    };
    await store.markVerified(currentRuntime!.version);
    await organizationService.update(googleOwner, {
      ...identity,
      staffAuthPolicy: "google",
    });
    await expect(service.workspace(owner)).rejects.toMatchObject({
      code: "GOOGLE_SESSION_REQUIRED",
    });
    expect(await service.workspace(googleOwner)).toMatchObject({
      staffRequiresGoogle: true,
    });
    for (const mutate of [
      () =>
        service.save(googleOwner, {
          expectedVersion: saved.version,
          ...credentials(),
        }),
      () =>
        service.setEnabled(googleOwner, {
          ...action(saved.version),
          enabled: false,
        }),
      () => service.disconnect(googleOwner, action(saved.version)),
    ])
      await expect(mutate()).rejects.toMatchObject({ status: 409 });
    expect(await store.accepts(currentRuntime!.version)).toBe(true);
    expect((await service.workspace(googleOwner)).version).toBe(saved.version);
  });

  it("requires saved credentials and keeps disconnect disabled after restart", async () => {
    const { owner } = await club();
    const replacement = credentials();
    const { store, service } = services();
    expect(await store.runtime()).toBeNull();
    expect(await store.enabled()).toBe(false);
    expect(await store.accepts("environment:obsolete-bootstrap")).toBe(false);
    const initial = await service.workspace(owner);
    expect(initial).toMatchObject({
      version: 0,
      configured: false,
      enabled: false,
    });
    let saved = await service.save(owner, {
      expectedVersion: 0,
      ...replacement,
    });
    secretFree(saved, [replacement.clientSecret]);
    expect(await store.runtime()).toBeNull();
    saved = await service.setEnabled(owner, {
      ...action(saved.version),
      enabled: true,
    });
    expect(
      (await store.runtime())?.clientSecret === replacement.clientSecret,
    ).toBe(true);
    const disconnected = await service.disconnect(owner, action(saved.version));
    secretFree(disconnected, [replacement.clientSecret]);
    expect(disconnected).toMatchObject({
      enabled: false,
      hasSecret: false,
      verifiedAt: null,
    });
    const [retained] = await db.select().from(googleAuthConfiguration);
    expect(retained.clientSecret === null && retained.clientId === null).toBe(
      true,
    );
    const restarted = services();
    expect(await restarted.store.runtime()).toBeNull();
    await expect(
      restarted.service.setEnabled(owner, {
        ...action(disconnected.version),
        enabled: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const unavailable = services("");
    expect((await unavailable.service.workspace(owner)).encryptionReady).toBe(
      false,
    );
    await expect(
      unavailable.service.save(owner, {
        expectedVersion: disconnected.version,
        ...replacement,
      }),
    ).rejects.toMatchObject({ code: "ENCRYPTION_UNAVAILABLE" });
  });

  it("setup preserves an existing key and refuses replacement when encrypted integration data exists", async () => {
    const { owner } = await club();
    const path = resolve(".local", "runtime-guard-" + randomUUID() + ".env");
    const original = "APP_URL=http://127.0.0.1:3000\n";
    try {
      await writeFile(path, original, { mode: 0o600 });
      await ensureIntegrationKey(path, migrationPool);
      const generated = await readFile(path, "utf8");
      expect(
        /^[a-f0-9]{64}$/.test(
          parseEnv(generated).INTEGRATION_ENCRYPTION_KEY ?? "",
        ),
      ).toBe(true);
      await ensureIntegrationKey(path, migrationPool);
      expect((await readFile(path, "utf8")) === generated).toBe(true);
      await services().service.save(owner, {
        expectedVersion: 0,
        ...credentials(),
      });
      await writeFile(path, original);
      await expect(ensureIntegrationKey(path, migrationPool)).rejects.toThrow(
        "Restore the existing integration encryption key",
      );
      expect((await readFile(path, "utf8")) === original).toBe(true);
    } finally {
      await rm(path, { force: true });
    }
  });

  it("invalidates earlier runtime revisions and ignores stale verification after rotation, pause and disconnect", async () => {
    const { owner } = await club();
    const { store, service } = services();
    const first = credentials();
    let saved = await service.save(owner, { expectedVersion: 0, ...first });
    saved = await service.setEnabled(owner, {
      ...action(saved.version),
      enabled: true,
    });
    const original = await store.runtime();
    expect(await store.accepts(original!.version)).toBe(true);
    for (const version of [
      undefined,
      null,
      1,
      "",
      "unrelated-provider-version",
    ]) {
      expect(await store.accepts(version)).toBe(false);
    }
    await store.markVerified(original!.version);
    expect((await service.workspace(owner)).verifiedAt !== null).toBe(true);
    const replacement = credentials();
    saved = await service.save(owner, {
      expectedVersion: saved.version,
      ...replacement,
    });
    secretFree(saved, [first.clientSecret, replacement.clientSecret]);
    expect(saved).toMatchObject({ enabled: false, verifiedAt: null });
    expect(await store.accepts(original!.version)).toBe(false);
    await store.markVerified(original!.version);
    expect((await service.workspace(owner)).verifiedAt).toBeNull();
    saved = await service.setEnabled(owner, {
      ...action(saved.version),
      enabled: true,
    });
    const rotated = await store.runtime();
    expect(rotated?.version === original?.version).toBe(false);
    expect(await store.accepts(rotated!.version)).toBe(true);
    await store.markVerified(rotated!.version);
    saved = await service.setEnabled(owner, {
      ...action(saved.version),
      enabled: false,
    });
    expect(await store.accepts(rotated!.version)).toBe(false);
    saved = await service.setEnabled(owner, {
      ...action(saved.version),
      enabled: true,
    });
    const reenabled = await store.runtime();
    expect(await store.accepts(rotated!.version)).toBe(false);
    expect(await store.accepts(reenabled!.version)).toBe(true);
    await service.disconnect(owner, action(saved.version));
    await store.markVerified(reenabled!.version);
    expect(await store.accepts(reenabled!.version)).toBe(false);
    expect((await service.workspace(owner)).verifiedAt).toBeNull();
  });
});
