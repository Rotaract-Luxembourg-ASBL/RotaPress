import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const stack = process.env.ROTAPRESS_STACK || "rotapress-hosted";
if (!/^rotapress-[a-z0-9-]{1,40}$/u.test(stack))
  throw new Error("Use a RotaPress stack name starting with rotapress-.");
export const directory = resolve(root, ".local", "hosting", stack);
export const envPath = resolve(directory, "production.env");

export function savePrivate(path, content) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}
export function saveSettings(values) {
  // Single-quoted Compose dotenv values preserve $, backslashes and spaces.
  // Credentials containing quote/control characters are rejected at the boundary.
  const lines = Object.entries(values).map(([key, value]) => {
    if (!/^[A-Z][A-Z0-9_]+$/u.test(key) || /['\r\n\0]/u.test(value))
      throw new Error(
        "Hosting settings must use single-line values without apostrophes.",
      );
    return `${key}='${value}'`;
  });
  savePrivate(envPath, `${lines.join("\n")}\n`);
}
export function settings() {
  if (!existsSync(envPath))
    throw new Error("Run node scripts/host.mjs configure first.");
  return parseEnv(readFileSync(envPath, "utf8"));
}

export function composeArgs(args) {
  return [
    "compose",
    "--project-name",
    stack,
    "--env-file",
    envPath,
    "--file",
    resolve(root, "compose.production.yaml"),
    ...(process.env.ROTAPRESS_COMPOSE_OVERRIDE
      ? ["--file", resolve(process.env.ROTAPRESS_COMPOSE_OVERRIDE)]
      : []),
    ...args,
  ];
}
export function compose(args, { capture = false, input, output } = {}) {
  return new Promise((done, reject) => {
    const child = spawn("docker", composeArgs(args), {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, ROTAPRESS_HOST_ENV: envPath },
      stdio: [
        input ? "pipe" : "ignore",
        capture || output ? "pipe" : "inherit",
        capture ? "pipe" : "inherit",
      ],
    });
    const chunks = [];
    // Capture operations can include secrets; never forward stderr or error data.
    if (capture) {
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.stderr.resume();
    }
    if (output) {
      output.on("error", () => {
        child.kill();
        reject(new Error("Cannot write the recovery archive."));
      });
      child.stdout.pipe(output);
    }
    if (input) {
      input.on("error", () => {
        child.kill();
        reject(new Error("Cannot read the recovery archive."));
      });
      child.stdin.on("error", () => {});
      input.pipe(child.stdin);
    }
    child.on("error", () =>
      reject(
        new Error(
          "Docker with Compose is required. Start Docker and try again.",
        ),
      ),
    );
    child.on("close", (code) => {
      if (code !== 0)
        return reject(
          new Error(
            `Hosting operation failed (${args[0]}). Check node scripts/host.mjs logs.`,
          ),
        );
      if (output) {
        if (output.writableFinished) done("");
        else output.once("finish", () => done(""));
      } else done(capture ? Buffer.concat(chunks).toString("utf8") : "");
    });
  });
}

export function writeSetupLink(values) {
  const link = `${values.APP_URL}/setup#setup=${values.ROTAPRESS_SETUP_CLAIM}`;
  savePrivate(resolve(directory, "setup-link.txt"), `${link}\n`);
  console.log(
    `Open the private setup link in ${resolve(directory, "setup-link.txt")} and verify your owner email. The link expires after one hour.`,
  );
}
