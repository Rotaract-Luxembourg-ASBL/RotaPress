import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertLocalDatabase,
  local,
  readEnv,
  reportFailure,
} from "./local_common.mjs";
import { applyDatabaseMigrations } from "./database_migrations.mjs";

export async function migrateDatabase(connection) {
  const target = assertLocalDatabase(connection);
  await applyDatabaseMigrations(connection);
  console.log(`Reviewed migrations applied to ${target.pathname.slice(1)}.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const test = process.argv.includes("--test");
    const values = readEnv(resolve(local, test ? "test.env" : "migration.env"));
    await migrateDatabase(
      values[test ? "TEST_MIGRATION_DATABASE_URL" : "MIGRATION_DATABASE_URL"],
    );
  } catch (error) {
    reportFailure(error);
  }
}
