import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertLocalDatabase, local, readEnv, reportFailure, root } from "./local_common.mjs";

export async function migrateDatabase(connection) {
  const target = assertLocalDatabase(connection);
  if (target.username !== "rotapress_migrator") throw new Error("Migrations require the dedicated migrator role.");
  const client = new pg.Client({ connectionString: connection, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(173924, 2)");
    await migrate(drizzle(client), { migrationsFolder: resolve(root, "db", "migrations") });
    await client.query("REVOKE ALL ON SCHEMA club FROM PUBLIC");
    await client.query("GRANT USAGE ON SCHEMA club TO rotapress_app");
    await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA club TO rotapress_app");
    await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA club TO rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.audit_entry FROM rotapress_app");
    await client.query("REVOKE INSERT, DELETE, TRUNCATE ON club.installation FROM rotapress_app");
    await client.query("REVOKE INSERT, DELETE, TRUNCATE ON club.owner_recovery FROM rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.cms_revision FROM rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.event_revision FROM rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.event_package_revision FROM rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.event_prize_revision FROM rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.event_entry, club.event_entry_review FROM rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.event_draw, club.event_draw_result, club.event_draw_review FROM rotapress_app");
    await client.query("REVOKE UPDATE, TRUNCATE ON club.event_draw_slot FROM rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.luma_purchase_identity, club.luma_purchase_order FROM rotapress_app");
    await client.query("REVOKE DELETE, TRUNCATE ON club.luma_purchase_refresh FROM rotapress_app");
    await client.query("REVOKE UPDATE, DELETE, TRUNCATE ON club.form_version FROM rotapress_app");
    await client.query("ALTER DEFAULT PRIVILEGES FOR ROLE rotapress_migrator IN SCHEMA club GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rotapress_app");
    await client.query("ALTER DEFAULT PRIVILEGES FOR ROLE rotapress_migrator IN SCHEMA club GRANT USAGE, SELECT ON SEQUENCES TO rotapress_app");
    console.log(`Reviewed migrations applied to ${target.pathname.slice(1)}.`);
  } finally {
    await client.query("SELECT pg_advisory_unlock(173924, 2)");
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const test = process.argv.includes("--test");
    const values = readEnv(resolve(local, test ? "test.env" : "migration.env"));
    await migrateDatabase(values[test ? "TEST_MIGRATION_DATABASE_URL" : "MIGRATION_DATABASE_URL"]);
  } catch (error) {
    reportFailure(error);
  }
}
