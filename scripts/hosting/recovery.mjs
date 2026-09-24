import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import {
  compose,
  directory,
  envPath,
  saveSettings,
  settings,
  writeSetupLink,
} from "./operator.mjs";

async function hash(path) {
  const value = createHash("sha256");
  for await (const chunk of createReadStream(path)) value.update(chunk);
  return value.digest("hex");
}
const helper = (script, args = [], interactive = false) => [
  "run",
  "--rm",
  "--no-deps",
  ...(interactive ? ["--interactive"] : []),
  "--entrypoint",
  "node",
  "web",
  `scripts/hosting/${script}.mjs`,
  ...args,
];

export async function backup() {
  settings();
  const target = resolve(
    directory,
    "backups",
    new Date().toISOString().replaceAll(/[:.]/gu, "-"),
  );
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const running = (
    await compose(["ps", "--status", "running", "--services"], {
      capture: true,
    })
  )
    .split(/\r?\n/u)
    .includes("web");
  if (running) await compose(["stop", "web"]);
  try {
    console.log(
      "Saving a consistent database and upload backup. Website writes are paused.",
    );
    await compose(
      [
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "--username=rotapress_bootstrap",
        "--dbname=rotapress",
        "--format=custom",
        "--no-owner",
      ],
      {
        output: createWriteStream(resolve(target, "database.dump"), {
          mode: 0o600,
          flags: "wx",
        }),
      },
    );
    await compose(helper("uploads", ["backup"]), {
      output: createWriteStream(resolve(target, "uploads.jsonl"), {
        mode: 0o600,
        flags: "wx",
      }),
    });
    writeFileSync(resolve(target, "recovery.env"), readFileSync(envPath), {
      mode: 0o600,
      flag: "wx",
    });
    const files = {};
    for (const name of ["database.dump", "uploads.jsonl", "recovery.env"])
      files[name] = await hash(resolve(target, name));
    writeFileSync(
      resolve(target, "manifest.json"),
      `${JSON.stringify({ version: 1, files }, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      `Backup saved: ${target}\nKeep the entire folder private and copy it to a separate protected location; it includes recovery keys and email credentials.`,
    );
    return target;
  } finally {
    if (running) await compose(["start", "web"]);
  }
}

export async function restore(source) {
  const target = resolve(source);
  const manifest = JSON.parse(
    readFileSync(resolve(target, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1) throw new Error("Unsupported recovery archive.");
  for (const name of ["database.dump", "uploads.jsonl", "recovery.env"]) {
    if ((await hash(resolve(target, name))) !== manifest.files?.[name])
      throw new Error("Backup integrity check failed; nothing was restored.");
  }
  // Never reuse an existing operator configuration or stack. This also prevents
  // restoring over the original host even if its app is temporarily stopped.
  if (existsSync(envPath))
    throw new Error(
      "Restore requires a fresh checkout or a new ROTAPRESS_STACK. Existing installation preserved.",
    );
  const values = parseEnv(
    readFileSync(resolve(target, "recovery.env"), "utf8"),
  );
  saveSettings(values);
  await compose(["build", "web"]);
  await compose(["up", "--detach", "--wait", "postgres"]);
  await compose(helper("uploads", ["empty"]));
  await compose(helper("restore-database"));
  // Roles and grants were prepared without migrations. Import ownership belongs
  // to the migrator so subsequent forward migrations work normally. Startup
  // reapplies reviewed grants; database-owner ACLs must not run as the migrator.
  await compose(
    [
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "--username=rotapress_bootstrap",
      "--dbname=rotapress",
      "--role=rotapress_migrator",
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "--single-transaction",
    ],
    { input: createReadStream(resolve(target, "database.dump")) },
  );
  await compose(helper("uploads", ["restore"], true), {
    input: createReadStream(resolve(target, "uploads.jsonl")),
  });
  console.log(
    "Database, uploads and recovery keys restored. Start this stack when your domain points here: node scripts/host.mjs start. Newer migrations run automatically.",
  );
  writeSetupLink(values);
}
