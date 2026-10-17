import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import pg from "pg";
import { root } from "./local_common.mjs";
import {
  assertPaused,
  assertTarget,
  digest,
  inventory,
  same,
} from "./reset/inventory.mjs";
import {
  checkedBackup,
  checkCurrentFiles,
  rehearseFiles,
  resetBackup,
  sealBackup,
} from "./reset/backup.mjs";
import { resetTransaction } from "./reset/transaction.mjs";
import {
  prepareCompletion,
  readCompletion,
  finishCompletion,
} from "./reset/completion.mjs";
import { readJson, writeJson } from "./reset/files.mjs";

const options = {
  target: { type: "string" },
  "runtime-env": { type: "string", default: ".env.local" },
  "database-env": { type: "string", default: ".local/migration.env" },
  backup: { type: "string" },
  owner: { type: "string", multiple: true },
  schema: { type: "string" },
  rehearsal: { type: "string" },
  generation: { type: "string" },
};
const usage =
  "Usage: node scripts/content-reset.mjs inventory|seal|rehearse|apply|finish-files --target <exact-origin> --runtime-env <file|process> --database-env <file|process> [--backup <folder> --owner <user-id> --schema <fingerprint> --rehearsal <receipt> --generation <id>]";
const readConfiguration = async (path) =>
  path === "process"
    ? process.env
    : parseEnv(await readFile(resolve(path), "utf8"));

async function main() {
  const { values, positionals } = parseArgs({
    options,
    allowPositionals: true,
  });
  const mode = positionals[0];
  if (
    !["inventory", "seal", "rehearse", "apply", "finish-files"].includes(
      mode,
    ) ||
    positionals.length !== 1 ||
    !values.target
  )
    throw new Error(usage);
  const runtime = await readConfiguration(values["runtime-env"]);
  const migration = await readConfiguration(values["database-env"]);
  const target = new URL(values.target);
  if (target.origin !== values.target || runtime.APP_URL !== values.target)
    throw new Error("RESET_EXPLICIT_TARGET_MISMATCH");
  const connection = new URL(migration.MIGRATION_DATABASE_URL);
  const runtimeConnection = new URL(runtime.DATABASE_URL);
  if (
    connection.username !== "rotapress_migrator" ||
    connection.protocol !== "postgresql:"
  )
    throw new Error("RESET_MIGRATOR_REQUIRED");
  if (mode === "rehearse") {
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) ||
      !/^\/rotapress_reset_rehearsal_[a-z0-9_]{1,48}$/u.test(
        connection.pathname,
      )
    )
      throw new Error("RESET_ISOLATED_REHEARSAL_REQUIRED");
  } else if (
    connection.host !== runtimeConnection.host ||
    connection.pathname !== runtimeConnection.pathname
  )
    throw new Error("RESET_DATABASE_TARGET_MISMATCH");
  const client = new pg.Client({
    connectionString: connection.toString(),
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const source = await inventory(client);
    if (mode === "inventory") {
      process.stdout.write(
        JSON.stringify({ target: values.target, ...source }, null, 2) + "\n",
      );
      return;
    }
    await assertPaused(client);
    if (!values.backup) throw new Error("RESET_BACKUP_REQUIRED");
    if (mode === "seal") {
      await checkedBackup(values.backup);
      const result = await sealBackup(values.backup, values.target, source);
      process.stdout.write(
        JSON.stringify({ sealed: true, manifestFingerprint: digest(result) }) +
          "\n",
      );
      return;
    }
    const backup = await resetBackup(values.backup, values.target);
    if (mode === "finish-files") {
      const receipt = await readCompletion(
        backup,
        values.target,
        values.generation,
      );
      process.stdout.write(
        JSON.stringify(await finishCompletion(client, root, backup, receipt)) +
          "\n",
      );
      return;
    }
    assertTarget(source, backup.manifest.source);
    if (mode === "rehearse") {
      const id = randomUUID();
      const restoredFiles = await rehearseFiles(
        backup.root,
        resolve(root, ".local/reset-rehearsals", id, "uploads"),
      );
      const result = await resetTransaction(client, source, { commit: true });
      const receipt = {
        format: "rotapress-reset-rehearsal",
        version: 1,
        id,
        createdAt: new Date().toISOString(),
        target: values.target,
        manifestFingerprint: backup.manifestFingerprint,
        restoredFiles,
        ...result,
      };
      const path = resolve(backup.root, `rehearsal-${id}.json`);
      await writeJson(path, receipt);
      process.stdout.write(
        JSON.stringify({
          rehearsed: true,
          receipt: path,
          protectedUnchanged: true,
          emptyContent: true,
        }) + "\n",
      );
      return;
    }
    if (
      !values.rehearsal ||
      !values.schema ||
      !same([...(values.owner ?? [])].sort(), source.ownerIds) ||
      values.schema !== source.schemaFingerprint
    )
      throw new Error("RESET_REVIEWED_IDENTIFIERS_REQUIRED");
    const receipt = await readJson(resolve(values.rehearsal));
    if (
      !receipt ||
      receipt.format !== "rotapress-reset-rehearsal" ||
      receipt.version !== 1 ||
      receipt.target !== values.target ||
      receipt.manifestFingerprint !== backup.manifestFingerprint ||
      receipt.sourceFingerprint !== source.dataFingerprint ||
      receipt.protectedFingerprint !== source.protectedFingerprint ||
      !receipt.committed ||
      !receipt.emptyContent ||
      !Number.isSafeInteger(receipt.restoredFiles)
    )
      throw new Error("RESET_REHEARSAL_MISMATCH");
    await checkCurrentFiles(
      resolve(root, ".data/uploads"),
      backup.files["uploads.jsonl"],
    );
    const generation = randomUUID();
    const completion = await prepareCompletion(
      root,
      backup,
      values.target,
      generation,
    );
    await resetTransaction(client, source, { commit: true, generation });
    try {
      process.stdout.write(
        JSON.stringify(
          await finishCompletion(client, root, backup, completion),
        ) + "\n",
      );
    } catch {
      process.stderr.write(
        JSON.stringify({
          code: "RESET_DATABASE_COMMITTED_FILES_PENDING",
          generation,
          receipt: resolve(backup.root, `reset-${generation}.json`),
          recovery:
            "Keep writes stopped. Run finish-files with this generation and verified backup.",
        }) + "\n",
      );
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Never print a database exception, connection string, authentication row or backup contents.
  process.stderr.write(
    `${error instanceof Error && (error.message === usage || /^RESET_[A-Z_]+$/u.test(error.message)) ? error.message : "RESET_REFUSED_CHECK_TARGET_AND_BACKUP"}\n`,
  );
  process.exitCode = 1;
});
