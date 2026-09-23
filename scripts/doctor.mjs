import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { assertLocalDatabase, compose, docker, local, portAvailable, readEnv, requireSupportedNode, root } from "./local_common.mjs";

let failures = 0;
async function check(label, operation) {
  try {
    console.log(`OK ${label}: ${await operation()}`);
  } catch {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

await check("patched project Node.js runtime", async () => requireSupportedNode());
await check("pinned pnpm", async () => {
  const agent = process.env.npm_config_user_agent;
  if (!agent?.startsWith("pnpm/")) throw new Error();
  return agent.split(" ")[0];
});
await check("Docker engine (start Docker Desktop if unavailable)", async () =>
  docker(["info", "--format", "{{.ServerVersion}}"], { stdio: "pipe" }).stdout.trim());
await check("RotaPress local services (run node scripts/pnpm.mjs setup if unavailable)", async () => {
  const services = compose(["ps", "--services", "--status", "running"], { stdio: "pipe" }).stdout;
  if (!services.includes("postgres") || !services.includes("mailpit")) throw new Error();
  return "PostgreSQL and Mailpit running";
});
await check("runtime database is local and restricted", async () => {
  const env = readEnv(resolve(root, ".env.local"));
  assertLocalDatabase(env.DATABASE_URL, ["rotapress"]);
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 4000 });
  await client.connect();
  try {
    const result = await client.query(`SELECT current_user, version(), rolsuper, rolcreatedb, rolcreaterole,
      has_schema_privilege(current_user, 'club', 'CREATE') AS can_create,
      has_schema_privilege(current_user, 'club', 'USAGE') AS can_use,
      to_regclass('club.installation') IS NOT NULL AS migrated
      FROM pg_roles WHERE rolname = current_user`);
    const role = result.rows[0];
    if (role.current_user !== "rotapress_app" || role.rolsuper || role.rolcreatedb || role.rolcreaterole
        || role.can_create || !role.can_use || !role.migrated) throw new Error();
    return role.version.split(",")[0];
  } finally {
    await client.end();
  }
});
await check("separate test database configured", async () => {
  const env = readEnv(resolve(local, "test.env"));
  assertLocalDatabase(env.DATABASE_URL, ["rotapress_test"]);
  return "rotapress_test";
});
await check("Mailpit HTTP", async () => {
  const response = await fetch("http://127.0.0.1:18025/livez", { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error();
  return "http://127.0.0.1:18025";
});
await check("configured local application", async () => {
  const env = readEnv(resolve(root, ".env.local"));
  const origin = new URL(env.APP_URL);
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error();
  if (await portAvailable(Number(origin.port || 80))) return `${origin.origin} available; run node scripts/pnpm.mjs dev`;
  const response = await fetch(`${origin.origin}/api/health`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error();
  const health = await response.json();
  if (health.status !== "ok" || health.application !== "RotaPress") throw new Error();
  return `${origin.origin} RotaPress health endpoint responding`;
});
console.log(`Doctor finished with ${failures} issue(s). ${existsSync(resolve(root, ".env.local")) ? "Runtime environment exists." : "Run node scripts/pnpm.mjs setup."}`);
process.exitCode = failures ? 1 : 0;
