import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { account, user } from "../../db/schema/auth";
import {
  auditEntry,
  installation,
  membership,
  organization,
  ownerRecovery,
  type MembershipRole,
  type MembershipStatus,
} from "../../db/schema/club";
import {
  AuthorizationService,
  type Capability,
  type TrustedActor,
} from "../../src/core/authorization/AuthorizationService";
import { InstallationService } from "../../src/core/installation/InstallationService";
import { RecoveryService } from "../../src/core/installation/RecoveryService";
import { OrganizationService } from "../../src/core/organization/OrganizationService";
import { MembershipService } from "../../src/features/members/MembershipService";
import type { Database } from "../../src/infrastructure/database/client";
import { installationEmailChecks } from "./installation-email-cases";

let runtimePool: Pool;
let migrationPool: Pool;
let db: Database;
let authorization: AuthorizationService;
let installationService: InstallationService;
let members: MembershipService;
installationEmailChecks(() => ({ db, actor: syntheticActor, prepareClaim }));

const identity = {
  name: "Fictional Community Club",
  tagline: "Synthetic critical test club",
  description: "",
  locale: "en" as const,
  timezone: "Europe/Luxembourg",
  accentColor: "#25636b",
};

function requireTestDatabase(connectionString: string | undefined): string {
  if (!connectionString)
    throw new Error("Run pnpm setup to prepare .local/test.env first.");
  const target = new URL(connectionString);
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/rotapress_test"
  ) {
    throw new Error(
      "Critical checks require the explicit disposable local rotapress_test database.",
    );
  }
  return connectionString;
}

// Service fixtures model trusted server context only. Browser authentication is
// exercised separately through Better Auth and a real code delivered to Mailpit.
async function syntheticActor(label: string): Promise<TrustedActor> {
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

async function prepareClaim(owner: TrustedActor) {
  const claim = randomBytes(32).toString("hex");
  await migrationPool.query(
    "INSERT INTO club.installation (id, nominated_email, claim_hash, claim_expires_at) VALUES (1, $1, $2, $3)",
    [
      owner.email,
      createHash("sha256").update(claim).digest("hex"),
      new Date(Date.now() + 60_000),
    ],
  );
  return { ...identity, claim };
}

async function installedClub() {
  const owner = await syntheticActor("owner");
  const claimInput = await prepareClaim(owner);
  await installationService.complete(owner, claimInput);
  const access = await authorization.require(owner, "ownership.manage");
  return { owner, access };
}

beforeAll(async () => {
  const env = parseEnv(await readFile(".local/test.env", "utf8"));
  runtimePool = new Pool({
    connectionString: requireTestDatabase(env.DATABASE_URL),
    max: 5,
  });
  migrationPool = new Pool({
    connectionString: requireTestDatabase(env.TEST_MIGRATION_DATABASE_URL),
    max: 2,
  });
  db = drizzle(runtimePool, { schema });
  authorization = new AuthorizationService(db);
  installationService = new InstallationService(db);
  members = new MembershipService(db, authorization);
});

beforeEach(async () => {
  await migrationPool.query(
    'TRUNCATE club.installation, club.organization, club.membership, club.audit_entry, club."user" CASCADE',
  );
});

afterAll(async () => {
  await Promise.all([runtimePool?.end(), migrationPool?.end()]);
});

describe("C01 protected installation on real PostgreSQL", () => {
  it("requires the verified nominated identity and unexpired claim; racing and repeated claims create one owner", async () => {
    const owner = await syntheticActor("owner");
    const other = await syntheticActor("other");
    const claimInput = await prepareClaim(owner);
    await expect(
      installationService.complete(other, claimInput),
    ).rejects.toMatchObject({ code: "SETUP_CLAIM_INVALID" });
    await expect(
      installationService.complete(
        { ...owner, emailVerified: false },
        claimInput,
      ),
    ).rejects.toMatchObject({ code: "VERIFIED_IDENTITY_REQUIRED" });
    await expect(
      installationService.complete(owner, {
        ...claimInput,
        role: "owner",
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow();
    await db
      .update(installation)
      .set({ claimExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(installation.id, 1));
    await expect(
      installationService.complete(owner, claimInput),
    ).rejects.toMatchObject({ code: "SETUP_CLAIM_INVALID" });
    expect(await db.select().from(organization)).toHaveLength(0);
    await db
      .update(installation)
      .set({ claimExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(installation.id, 1));
    const contenders = await Promise.allSettled([
      installationService.complete(owner, claimInput),
      installationService.complete(owner, claimInput),
    ]);
    expect(
      contenders.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      contenders.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      installationService.complete(other, claimInput),
    ).rejects.toMatchObject({ code: "SETUP_CLAIM_INVALID" });
    expect(await db.select().from(organization)).toHaveLength(1);
    expect(await db.select().from(membership)).toMatchObject([
      { userId: owner.userId, role: "owner", status: "approved" },
    ]);
    const [state] = await db.select().from(installation);
    expect(state).toMatchObject({ claimHash: null, claimExpiresAt: null });
    expect(state?.completedAt).toBeInstanceOf(Date);
    expect(await db.select().from(auditEntry)).toHaveLength(1);
    await expect(
      runtimePool.query("DELETE FROM club.audit_entry"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("C02 membership authority and current staff policy", () => {
  it("enforces the scoped capability matrix and rejects browser role or organization authority", async () => {
    const { owner, access } = await installedClub();
    await expect(
      authorization.require(
        { ...owner, authMethod: "unknown" },
        "admin.access",
      ),
    ).rejects.toMatchObject({ code: "AUTH_METHOD_REQUIRED" });
    const matrix: Array<{
      role: MembershipRole;
      status: MembershipStatus;
      allowed: Capability[];
    }> = [
      { role: "member", status: "pending", allowed: [] },
      { role: "member", status: "approved", allowed: [] },
      { role: "editor", status: "approved", allowed: ["admin.access"] },
      {
        role: "administrator",
        status: "approved",
        allowed: ["admin.access", "members.manage", "settings.manage"],
      },
      { role: "administrator", status: "suspended", allowed: [] },
      { role: "administrator", status: "rejected", allowed: [] },
      { role: "administrator", status: "former", allowed: [] },
    ];
    for (const [index, example] of matrix.entries()) {
      const actor = await syntheticActor(`matrix-${index}`);
      await db.insert(membership).values({
        organizationId: access.organizationId,
        userId: actor.userId,
        role: example.role,
        status: example.status,
      });
      const forgedActor = {
        ...actor,
        role: "owner",
        organizationId: randomUUID(),
      };
      for (const capability of [
        "admin.access",
        "members.manage",
        "settings.manage",
        "ownership.manage",
      ] as const) {
        if (example.allowed.includes(capability)) {
          expect(
            (await authorization.require(forgedActor, capability))
              .organizationId,
          ).toBe(access.organizationId);
        } else {
          await expect(
            authorization.require(forgedActor, capability),
          ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
        }
      }
    }
    const applicant = await syntheticActor("applicant");
    const application = await members.apply(applicant);
    expect(application).toMatchObject({ role: "member", status: "pending" });
    await expect(
      members.change(applicant, {
        membershipId: application!.id,
        status: "approved",
        role: "owner",
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      members.change(owner, {
        membershipId: application!.id,
        status: "approved",
        role: "member",
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      members.change(owner, {
        membershipId: randomUUID(),
        status: "approved",
        role: "member",
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
  });

  it("applies approval and suspension immediately; a reapplication cannot recover a former staff role", async () => {
    const { owner } = await installedClub();
    const applicant = await syntheticActor("applicant");
    const application = await members.apply(applicant);
    const membershipId = application!.id;
    await expect(
      authorization.require(applicant, "admin.access"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await members.change(owner, {
      membershipId,
      role: "editor",
      status: "approved",
    });
    expect(
      await authorization.require(applicant, "admin.access"),
    ).toMatchObject({ role: "editor" });
    await members.change(owner, {
      membershipId,
      role: "editor",
      status: "suspended",
    });
    await expect(
      authorization.require(applicant, "admin.access"),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(members.apply(applicant)).rejects.toMatchObject({
      code: "MEMBERSHIP_SUSPENDED",
    });
    await members.change(owner, {
      membershipId,
      role: "editor",
      status: "former",
    });
    expect(await members.apply(applicant)).toMatchObject({
      role: "member",
      status: "pending",
    });
    const stale = {
      ...owner,
      authenticatedAt: new Date(Date.now() - 16 * 60_000),
    };
    await expect(
      members.change(stale, {
        membershipId,
        role: "editor",
        status: "approved",
      }),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
  });

  it("protects the last owner even when two owners concurrently relinquish their roles", async () => {
    const { owner, access } = await installedClub();
    await expect(
      members.change(owner, {
        membershipId: access.membershipId,
        role: "member",
        status: "approved",
      }),
    ).rejects.toMatchObject({ code: "LAST_OWNER" });
    const secondOwner = await syntheticActor("second-owner");
    const application = await members.apply(secondOwner);
    await members.change(owner, {
      membershipId: application!.id,
      role: "owner",
      status: "approved",
    });
    const results = await Promise.allSettled([
      members.change(owner, {
        membershipId: access.membershipId,
        role: "member",
        status: "approved",
      }),
      members.change(secondOwner, {
        membershipId: application!.id,
        role: "member",
        status: "approved",
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const rows = await db.select().from(membership);
    expect(
      rows.filter((row) => row.role === "owner" && row.status === "approved"),
    ).toHaveLength(1);
  });

  it("requires the current Google session, rejects unsafe activation, and projects only public identity fields", async () => {
    const { owner, access } = await installedClub();
    const unavailableGoogle = new OrganizationService(db, authorization, {
      enabled: async () => false,
      accepts: async () => false,
    });
    await expect(
      unavailableGoogle.update(owner, {
        ...identity,
        staffAuthPolicy: "google",
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_UNCONFIGURED" });
    const configuredGoogle = new OrganizationService(db, authorization, {
      enabled: async () => true,
      accepts: async (version) => version === "fixture-google-config",
    });
    await expect(
      configuredGoogle.update(owner, {
        ...identity,
        staffAuthPolicy: "google",
      }),
    ).rejects.toMatchObject({ code: "GOOGLE_SESSION_REQUIRED" });
    await db.insert(account).values({
      id: randomUUID(),
      userId: owner.userId,
      providerId: "google",
      accountId: randomUUID(),
    });
    await db
      .update(organization)
      .set({ staffAuthPolicy: "google" })
      .where(eq(organization.id, access.organizationId));
    await expect(
      authorization.require(owner, "admin.access"),
    ).rejects.toMatchObject({ code: "GOOGLE_SESSION_REQUIRED" });
    // This is policy input, not a Google callback or live OAuth verification.
    expect(
      await authorization.require(
        { ...owner, authMethod: "google" },
        "admin.access",
      ),
    ).toMatchObject({ role: "owner" });
    await configuredGoogle.update(
      {
        ...owner,
        authMethod: "google",
        authProviderVersion: "fixture-google-config",
      },
      {
        ...identity,
        name: "Updated Synthetic Club",
        staffAuthPolicy: "google",
      },
    );
    const publicIdentity = await configuredGoogle.publicIdentity();
    expect(publicIdentity).toEqual({
      ...identity,
      name: "Updated Synthetic Club",
    });
    expect(publicIdentity).not.toHaveProperty("staffAuthPolicy");
    expect(publicIdentity).not.toHaveProperty("organizationId");
  });

  it("consumes local recovery once for its verified current owner, without changing membership or installation", async () => {
    const { owner, access } = await installedClub();
    const outsider = await syntheticActor("recovery-outsider");
    const service = new RecoveryService(db);
    const claim = randomBytes(32).toString("hex");
    const recoveryId = randomUUID();
    await migrationPool.query(
      "INSERT INTO club.owner_recovery (id, organization_id, user_id, nominated_email, claim_hash, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        recoveryId,
        access.organizationId,
        owner.userId,
        owner.email,
        createHash("sha256").update(claim).digest("hex"),
        new Date(Date.now() + 60_000),
      ],
    );
    await db
      .update(organization)
      .set({ staffAuthPolicy: "google" })
      .where(eq(organization.id, access.organizationId));
    await expect(service.complete(outsider, { claim })).rejects.toMatchObject({
      code: "RECOVERY_CLAIM_INVALID",
    });
    await expect(
      service.complete({ ...owner, emailVerified: false }, { claim }),
    ).rejects.toMatchObject({ code: "VERIFIED_IDENTITY_REQUIRED" });
    await expect(
      service.complete(
        { ...owner, authenticatedAt: new Date(Date.now() - 16 * 60_000) },
        { claim },
      ),
    ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
    await db
      .update(ownerRecovery)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(ownerRecovery.id, recoveryId));
    await expect(service.complete(owner, { claim })).rejects.toMatchObject({
      code: "RECOVERY_CLAIM_INVALID",
    });
    await db
      .update(ownerRecovery)
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(ownerRecovery.id, recoveryId));
    await db
      .update(membership)
      .set({ role: "member" })
      .where(eq(membership.id, access.membershipId));
    await expect(service.complete(owner, { claim })).rejects.toMatchObject({
      code: "RECOVERY_CLAIM_INVALID",
    });
    await db
      .update(membership)
      .set({ role: "owner" })
      .where(eq(membership.id, access.membershipId));
    const results = await Promise.allSettled([
      service.complete(owner, { claim }),
      service.complete(owner, { claim }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      await authorization.require(owner, "ownership.manage"),
    ).toMatchObject(access);
    expect(await installationService.isComplete()).toBe(true);
    const [recovery] = await db
      .select()
      .from(ownerRecovery)
      .where(eq(ownerRecovery.id, recoveryId));
    expect(recovery?.usedAt).toBeInstanceOf(Date);
    const recoveryAudits = await db
      .select()
      .from(auditEntry)
      .where(eq(auditEntry.action, "owner.recovery.completed"));
    expect(recoveryAudits).toHaveLength(1);
  });
});
