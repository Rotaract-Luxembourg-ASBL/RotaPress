import pg from "pg";
import { createHash, createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { applyDatabaseMigrations } from "../database_migrations.mjs";

export function hostingKeys(secret) {
  if (!/^[a-f0-9]{64}$/u.test(secret ?? ""))
    throw new Error("HOSTING_KEY_REQUIRED");
  const derive = (purpose) =>
    createHmac("sha256", Buffer.from(secret, "hex"))
      .update(`rotapress:hosting:v1:${purpose}`)
      .digest("hex");
  return {
    runtime: derive("database-runtime"),
    migrator: derive("database-migrator"),
    auth: derive("authentication"),
    encryption: derive("integration-encryption"),
  };
}

export function databaseConnection(bootstrapUrl, role, password) {
  const url = new URL(bootstrapUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.pathname !== "/rotapress" ||
    !url.username ||
    ["rotapress_app", "rotapress_migrator"].includes(url.username) ||
    !url.password ||
    url.search ||
    url.hash
  )
    throw new Error("HOSTING_DATABASE_REQUIRED");
  url.username = role;
  url.password = password;
  return url.href;
}

async function connect(bootstrapUrl) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const client = new pg.Client({
      connectionString: bootstrapUrl,
      connectionTimeoutMillis: 3000,
    });
    try {
      await client.connect();
      return client;
    } catch {
      await client.end().catch(() => {});
      if (attempt < 19) await delay(1500);
    }
  }
  throw new Error("HOSTING_DATABASE_UNAVAILABLE");
}

/** Runs before the web process. No database reset, role-password rotation or owner grants. */
async function withDatabase(
  { bootstrapUrl, secret, fresh = false },
  operation,
) {
  const keys = hostingKeys(secret);
  const runtimeUrl = databaseConnection(
    bootstrapUrl,
    "rotapress_app",
    keys.runtime,
  );
  const migratorUrl = databaseConnection(
    bootstrapUrl,
    "rotapress_migrator",
    keys.migrator,
  );
  const client = await connect(bootstrapUrl);
  try {
    await client.query("SELECT pg_advisory_lock(173924, 4)");
    const version = await client.query("SHOW server_version_num");
    if (Math.floor(Number(version.rows[0].server_version_num) / 10000) !== 17)
      throw new Error("HOSTING_POSTGRES_17_REQUIRED");
    if (fresh) {
      const content = await client.query(
        "SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public', 'information_schema') UNION ALL SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace LIMIT 1",
      );
      if (content.rowCount)
        throw new Error("HOSTING_RESTORE_REQUIRES_EMPTY_DATABASE");
    }
    for (const [role, password] of [
      ["rotapress_migrator", keys.migrator],
      ["rotapress_app", keys.runtime],
    ]) {
      const existing = await client.query(
        "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1",
        [role],
      );
      if (!existing.rowCount) {
        // Fixed identifiers and HMAC-derived hex passwords; no caller SQL is interpolated.
        await client.query(
          `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        );
      } else if (Object.values(existing.rows[0]).some(Boolean)) {
        throw new Error("HOSTING_DATABASE_ROLE_UNSAFE");
      }
      const memberships = await client.query(
        "SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = $1)",
        [role],
      );
      if (memberships.rowCount) throw new Error("HOSTING_DATABASE_ROLE_UNSAFE");
    }
    // Verify both existing accounts before changing schema or permissions. A lost
    // installation key cannot silently replace credentials on an existing database.
    for (const url of [runtimeUrl, migratorUrl]) {
      const probe = new pg.Client({
        connectionString: url,
        connectionTimeoutMillis: 3000,
      });
      try {
        await probe.connect();
      } finally {
        await probe.end();
      }
    }
    await client.query("REVOKE ALL ON DATABASE rotapress FROM PUBLIC");
    await client.query(
      "GRANT CONNECT ON DATABASE rotapress TO rotapress_app, rotapress_migrator",
    );
    await client.query(
      "GRANT CREATE ON DATABASE rotapress TO rotapress_migrator",
    );
    await client.query(
      "REVOKE ALL ON SCHEMA public FROM PUBLIC, rotapress_app",
    );
    await operation(client, migratorUrl);
    return {
      DATABASE_URL: runtimeUrl,
      BETTER_AUTH_SECRET: keys.auth,
      INTEGRATION_ENCRYPTION_KEY: keys.encryption,
    };
  } finally {
    await client.query("SELECT pg_advisory_unlock(173924, 4)");
    await client.end();
  }
}

export async function prepareHostedDatabase({
  bootstrapUrl,
  secret,
  ownerEmail,
  claim,
}) {
  if (
    !/^[A-Za-z0-9_-]{43}$/u.test(claim ?? "") ||
    typeof ownerEmail !== "string" ||
    ownerEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(ownerEmail)
  )
    throw new Error("HOSTING_OWNER_REQUIRED");
  return withDatabase({ bootstrapUrl, secret }, async (client, migratorUrl) => {
    await applyDatabaseMigrations(migratorUrl);
    const digest = createHash("sha256").update(claim).digest("hex");
    // A new, operator-generated claim can replace a pending claim. Restarting
    // with the same claim never extends its expiry or reopens a completed club.
    await client.query(
      `INSERT INTO club.installation (id, claim_hash, nominated_email, claim_expires_at)
      VALUES (1, $1, $2, now() + interval '1 hour')
      ON CONFLICT (id) DO UPDATE SET claim_hash = EXCLUDED.claim_hash,
        nominated_email = EXCLUDED.nominated_email, claim_expires_at = EXCLUDED.claim_expires_at
      WHERE club.installation.completed_at IS NULL AND club.installation.claim_hash IS DISTINCT FROM EXCLUDED.claim_hash`,
      [digest, ownerEmail.trim().toLowerCase()],
    );
  });
}

/** Recovery can provision roles only in an empty database, before importing a
 * dump as the migrator. Normal startup then applies any newer migrations. */
export async function prepareEmptyHostedDatabase({ bootstrapUrl, secret }) {
  return withDatabase({ bootstrapUrl, secret, fresh: true }, async () => {});
}
