import pg from "pg";
import { databaseUrl, databases } from "./local_common.mjs";

export async function prepareDatabases(secrets) {
  const bootstrap = new pg.Client({
    connectionString: databaseUrl("rotapress_bootstrap", secrets.POSTGRES_PASSWORD, "postgres"),
    connectionTimeoutMillis: 5000,
  });
  await bootstrap.connect();
  try {
    await bootstrap.query("SELECT pg_advisory_lock(173924, 1)");
    for (const [role, password] of [
      ["rotapress_migrator", secrets.MIGRATOR_PASSWORD],
      ["rotapress_app", secrets.RUNTIME_PASSWORD],
    ]) {
      if (!/^[a-f0-9]{64}$/u.test(password)) throw new Error("Malformed generated local database credential.");
      const existing = await bootstrap.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      if (existing.rowCount === 0) {
        // Both identifiers are fixed above and passwords are hex, never caller-supplied SQL.
        await bootstrap.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
      }
    }
    for (const database of databases) {
      const existing = await bootstrap.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
      if (existing.rowCount === 0) await bootstrap.query(`CREATE DATABASE ${database} OWNER rotapress_migrator`);
      await bootstrap.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
      await bootstrap.query(`GRANT CONNECT ON DATABASE ${database} TO rotapress_app`);
      const admin = new pg.Client({ connectionString: databaseUrl("rotapress_bootstrap", secrets.POSTGRES_PASSWORD, database) });
      await admin.connect();
      try {
        await admin.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
        await admin.query("REVOKE ALL ON SCHEMA public FROM rotapress_app");
      } finally {
        await admin.end();
      }
    }
    console.log("Dedicated developer and test databases prepared; runtime role has no schema-management privileges.");
  } finally {
    await bootstrap.query("SELECT pg_advisory_unlock(173924, 1)");
    await bootstrap.end();
  }
}
