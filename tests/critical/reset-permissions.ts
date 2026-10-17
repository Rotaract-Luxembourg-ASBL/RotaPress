import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { assertLocalDatabase } from "../../scripts/local_common.mjs";
import { applyDatabaseMigrations } from "../../scripts/database_migrations.mjs";

/** Match hosted ownership without changing either existing project database. */
export async function withRestrictedResetDatabase(
  migrationUrl: string,
  run: (client: Client) => Promise<void>,
) {
  const source = assertLocalDatabase(migrationUrl, ["rotapress_test"]);
  if (source.username !== "rotapress_migrator")
    throw new Error("Reset regression requires the dedicated test migrator.");
  const services = parseEnv(await readFile(".local/services.env", "utf8"));
  const bootstrapPassword = services.POSTGRES_PASSWORD;
  if (typeof bootstrapPassword !== "string" || !/^[a-f0-9]{64}$/.test(bootstrapPassword))
    throw new Error("Local bootstrap configuration is required.");
  const database = `rotapress_reset_permissions_${randomUUID().replaceAll("-", "")}`;
  const bootstrapUrl = new URL(source);
  bootstrapUrl.pathname = "/postgres";
  bootstrapUrl.username = "rotapress_bootstrap";
  bootstrapUrl.password = bootstrapPassword;
  const bootstrap = new Client({ connectionString: bootstrapUrl.toString() });
  const target = new URL(source);
  target.pathname = `/${database}`;
  let created = false;
  await bootstrap.connect();
  try {
    // This identifier is generated internally and contains only letters, digits
    // and underscores. No credentials or caller-supplied SQL are interpolated.
    await bootstrap.query(
      `CREATE DATABASE "${database}" OWNER rotapress_bootstrap`,
    );
    created = true;
    await bootstrap.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
    await bootstrap.query(
      `GRANT CONNECT, CREATE ON DATABASE "${database}" TO rotapress_migrator`,
    );
    await applyDatabaseMigrations(target.toString());
    const restricted = new Client({ connectionString: target.toString() });
    await restricted.connect();
    try {
      await run(restricted);
    } finally {
      await restricted.end();
    }
  } finally {
    try {
      if (created) await bootstrap.query(`DROP DATABASE "${database}"`);
    } finally {
      await bootstrap.end();
    }
  }
}
