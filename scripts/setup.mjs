import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { prepareDatabases } from "./db_prepare.mjs";
import { migrateDatabase } from "./db_migrate.mjs";
import { ensureIntegrationKey } from "./runtime_environment.mjs";
import { compose, databaseUrl, docker, local, portAvailable, readEnv, reportFailure, requireSupportedNode, root, writeEnv, writePrivate } from "./local_common.mjs";

async function prepareClaim(migrationUrl) {
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  const claimPath = resolve(local, "setup-claim.txt");
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(173924, 3)");
    const existing = await client.query("SELECT completed_at, claim_hash, claim_expires_at FROM club.installation WHERE id = 1 FOR UPDATE");
    if (existing.rows[0]?.completed_at) {
      await client.query("COMMIT");
      if (existsSync(claimPath)) rmSync(claimPath);
      console.log("Installation is already claimed; owner authority has been preserved.");
      return;
    }
    if (existsSync(claimPath) && existing.rows[0]?.claim_expires_at > new Date()) {
      const hash = createHash("sha256").update(readFileSync(claimPath, "utf8").trim()).digest("hex");
      if (hash === existing.rows[0].claim_hash) {
        await client.query("COMMIT");
        console.log("Existing unexpired setup claim preserved in .local/setup-claim.txt.");
        return;
      }
    }
    const ownerIndex = process.argv.indexOf("--owner-email");
    const ownerEmail = ownerIndex >= 0 ? process.argv[ownerIndex + 1] : "local-owner@example.test";
    if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.test$/u.test(ownerEmail)) {
      throw new Error("Local setup requires a synthetic nominated owner address ending in .test.");
    }
    const claim = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(claim).digest("hex");
    await client.query(`INSERT INTO club.installation (id, claim_hash, nominated_email, claim_expires_at)
      VALUES (1, $1, $2, now() + interval '1 hour')
      ON CONFLICT (id) DO UPDATE SET claim_hash = EXCLUDED.claim_hash,
        nominated_email = EXCLUDED.nominated_email, claim_expires_at = EXCLUDED.claim_expires_at
      WHERE club.installation.completed_at IS NULL`, [hash, ownerEmail.toLowerCase()]);
    await client.query("COMMIT");
    writePrivate(claimPath, `${claim}\n`);
    writePrivate(resolve(local, "setup-info.json"), `${JSON.stringify({ ownerEmail, setupUrl: "http://127.0.0.1:3000/setup", expiresInMinutes: 60 }, null, 2)}\n`);
    console.log("An expiring setup claim is saved privately in .local/setup-claim.txt; nominated owner details are in .local/setup-info.json.");
  } finally {
    await client.end();
  }
}

try {
  requireSupportedNode();
  docker(["info", "--format", "{{.ServerVersion}}"], { stdio: "pipe" });
  const secretsPath = resolve(local, "services.env");
  if (!existsSync(secretsPath)) writeEnv(secretsPath, {
    POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
    MIGRATOR_PASSWORD: randomBytes(32).toString("hex"),
    RUNTIME_PASSWORD: randomBytes(32).toString("hex"),
  });
  const secrets = readEnv(secretsPath);
  const current = compose(["ps", "--services", "--status", "running"], { stdio: "pipe" }).stdout;
  for (const [service, ports] of [["postgres", [55432]], ["mailpit", [18025, 11025]]]) {
    if (!current.split(/\r?\n/u).includes(service)) {
      for (const port of ports) {
        if (!await portAvailable(port)) throw new Error(`Port ${port} is occupied by another service; stop that service or choose an isolated project port before setup.`);
      }
    }
  }
  const migrationUrl = databaseUrl("rotapress_migrator", secrets.MIGRATOR_PASSWORD, "rotapress");
  const testMigrationUrl = databaseUrl("rotapress_migrator", secrets.MIGRATOR_PASSWORD, "rotapress_test");
  writeEnv(resolve(local, "migration.env"), { MIGRATION_DATABASE_URL: migrationUrl });
  writeEnv(resolve(local, "test.env"), {
    DATABASE_URL: databaseUrl("rotapress_app", secrets.RUNTIME_PASSWORD, "rotapress_test"),
    TEST_MIGRATION_DATABASE_URL: testMigrationUrl,
  });
  const runtimePath = resolve(root, ".env.local");
  if (!existsSync(runtimePath)) writeEnv(runtimePath, {
    DATABASE_URL: databaseUrl("rotapress_app", secrets.RUNTIME_PASSWORD, "rotapress"),
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
    APP_URL: "http://127.0.0.1:3000",
  });
  compose(["up", "--detach", "--wait", "--wait-timeout", "90"]);
  await prepareDatabases(secrets);
  await migrateDatabase(migrationUrl);
  await migrateDatabase(testMigrationUrl);
  const runtimeConfig = readEnv(runtimePath);
  if (!runtimeConfig.INTEGRATION_ENCRYPTION_KEY) {
    const client = new pg.Client({ connectionString: migrationUrl });
    await client.connect();
    try {
      await ensureIntegrationKey(runtimePath, client);
    } finally { await client.end(); }
  }
  await prepareClaim(migrationUrl);
  console.log("Local setup is ready. Run node scripts/pnpm.mjs dev, then open http://127.0.0.1:3000/setup. Mailpit: http://127.0.0.1:18025.");
} catch (error) {
  reportFailure(error);
}
