import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { z } from "zod";
import { prepareDatabases } from "./db_prepare.mjs";
import { migrateDatabase } from "./db_migrate.mjs";
import { ensureIntegrationKey } from "./runtime_environment.mjs";
import { compose, databaseUrl, docker, local, portAvailable, readEnv, reportFailure, requireSupportedNode, root, writeEnv, writePrivate } from "./local_common.mjs";

async function prepareClaim(migrationUrl, runtimeConfig) {
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  const claimPath = resolve(local, "setup-claim.txt");
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(173924, 3)");
    const existing = await client.query("SELECT completed_at, claim_hash, claim_expires_at, nominated_email FROM club.installation WHERE id = 1 FOR UPDATE");
    if (existing.rows[0]?.completed_at) {
      await client.query("COMMIT");
      if (existsSync(claimPath)) rmSync(claimPath);
      console.log("Installation is already claimed; owner authority has been preserved.");
      return;
    }
    const ownerIndex = process.argv.indexOf("--owner-email");
    const nominated = ownerIndex >= 0 ? process.argv[ownerIndex + 1] : undefined;
    const developmentMail = runtimeConfig.EMAIL_PROVIDER === "development";
    const ownerEmail = (nominated ?? existing.rows[0]?.nominated_email
      ?? (developmentMail ? "local-owner@example.test" : undefined))?.trim().toLowerCase();
    if (!ownerEmail && ownerIndex < 0) {
      await client.query("COMMIT");
      console.log("Configure email using docs/guides/email-setup.md, then run setup --owner-email your-address to nominate the first owner.");
      return;
    }
    if (!z.email().safeParse(ownerEmail).success
      || (developmentMail && !ownerEmail.endsWith(".test")))
      throw new Error("Supply a valid --owner-email. Development capture requires a synthetic address ending in .test.");
    if (["smtp", "resend"].includes(runtimeConfig.EMAIL_PROVIDER) && ownerEmail.endsWith(".test"))
      throw new Error("Nominate a real owner inbox with --owner-email when using SMTP or Resend.");
    if (existsSync(claimPath) && existing.rows[0]?.claim_expires_at > new Date()
      && ownerEmail === existing.rows[0].nominated_email.toLowerCase()) {
      const hash = createHash("sha256").update(readFileSync(claimPath, "utf8").trim()).digest("hex");
      if (hash === existing.rows[0].claim_hash) {
        await client.query("COMMIT");
        console.log("Existing unexpired setup claim preserved in .local/setup-claim.txt.");
        return;
      }
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
    writePrivate(resolve(local, "setup-info.json"), `${JSON.stringify({ ownerEmail, setupUrl: new URL("/setup", runtimeConfig.APP_URL).href, expiresInMinutes: 60 }, null, 2)}\n`);
    console.log("An expiring setup claim is saved privately in .local/setup-claim.txt; nominated owner details are in .local/setup-info.json.");
  } finally {
    await client.end();
  }
}

try {
  requireSupportedNode();
  const runtimePath = resolve(root, ".env.local");
  const priorConfig = existsSync(runtimePath) ? readEnv(runtimePath) : {};
  const enableDevelopmentMail = process.argv.includes("--development-mail");
  if (enableDevelopmentMail && (priorConfig.ROTAPRESS_ENVIRONMENT === "production"
    || ["smtp", "resend"].includes(priorConfig.EMAIL_PROVIDER)))
    throw new Error("Development mail cannot replace a production environment or configured provider. Change the server environment deliberately.");
  const developmentMail = enableDevelopmentMail || priorConfig.EMAIL_PROVIDER === "development";
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
    if (service === "mailpit" && !developmentMail) continue;
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
  if (!existsSync(runtimePath)) writeEnv(runtimePath, {
    DATABASE_URL: databaseUrl("rotapress_app", secrets.RUNTIME_PASSWORD, "rotapress"),
    BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
    APP_URL: "http://127.0.0.1:3000",
    ROTAPRESS_ENVIRONMENT: "development",
    EMAIL_PROVIDER: developmentMail ? "development" : "disabled",
    EMAIL_REMOTE_DELIVERY_ENABLED: "false",
  });
  else if (enableDevelopmentMail && (priorConfig.ROTAPRESS_ENVIRONMENT !== "development"
    || priorConfig.EMAIL_PROVIDER !== "development"))
    appendFileSync(runtimePath, "\nROTAPRESS_ENVIRONMENT=development\nEMAIL_PROVIDER=development\n", { encoding: "utf8", mode: 0o600 });
  compose([...(developmentMail ? ["--profile", "development"] : []), "up", "--detach", "--wait", "--wait-timeout", "90"]);
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
  await prepareClaim(migrationUrl, readEnv(runtimePath));
  console.log("Local infrastructure is ready. Run node scripts/pnpm.mjs dev and open /setup. Email setup: docs/guides/email-setup.md. No emails were sent by this command.");
} catch (error) {
  reportFailure(error);
}
