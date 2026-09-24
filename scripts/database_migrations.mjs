import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { root } from "./local_common.mjs";

/** Shared migration engine. Entry points must validate their deployment target. */
export async function applyDatabaseMigrations(connection) {
  if (new URL(connection).username !== "rotapress_migrator")
    throw new Error("Migrations require the dedicated migrator role.");
  const client = new pg.Client({
    connectionString: connection,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(173924, 2)");
    await migrate(drizzle(client), {
      migrationsFolder: resolve(root, "db", "migrations"),
    });
    await client.query("REVOKE ALL ON SCHEMA club FROM PUBLIC");
    await client.query("GRANT USAGE ON SCHEMA club TO rotapress_app");
    await client.query(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA club TO rotapress_app",
    );
    await client.query(
      "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA club TO rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.audit_entry FROM rotapress_app",
    );
    await client.query(
      "REVOKE INSERT, DELETE, TRUNCATE ON club.installation FROM rotapress_app",
    );
    await client.query(
      "REVOKE INSERT, DELETE, TRUNCATE ON club.owner_recovery FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.cms_revision FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.event_revision FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.event_package_revision FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.event_prize_revision FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.event_entry, club.event_entry_review FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.event_draw, club.event_draw_result, club.event_draw_review FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, TRUNCATE ON club.event_draw_slot FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.luma_purchase_identity, club.luma_purchase_order FROM rotapress_app",
    );
    await client.query(
      "REVOKE DELETE, TRUNCATE ON club.luma_purchase_refresh FROM rotapress_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE, TRUNCATE ON club.form_version FROM rotapress_app",
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE rotapress_migrator IN SCHEMA club GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rotapress_app",
    );
    await client.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE rotapress_migrator IN SCHEMA club GRANT USAGE, SELECT ON SEQUENCES TO rotapress_app",
    );
  } finally {
    await client.query("SELECT pg_advisory_unlock(173924, 2)");
    await client.end();
  }
}
