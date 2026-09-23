import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const local = resolve(root, ".local");
export const databases = ["rotapress", "rotapress_test"];

export function requireSupportedNode() {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const required = manifest.devEngines.runtime.version;
  const minimum = required.split(".").map(Number);
  const current = process.versions.node.split(".").map(Number);
  if (current[0] !== minimum[0] || current[1] < minimum[1]
      || (current[1] === minimum[1] && current[2] < minimum[2])) {
    throw new Error(`Use patched Node.js ${required} or a newer Node ${minimum[0]} patch. Run node scripts/pnpm.mjs install, then use project pnpm commands.`);
  }
  return process.version;
}

export function readEnv(path) {
  if (!existsSync(path)) throw new Error(`Missing ${path.replace(root, ".")}; run setup.`);
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) throw new Error("Invalid local environment file.");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

export function writePrivate(path, text) {
  mkdirSync(local, { recursive: true });
  writeFileSync(path, text, { encoding: "utf8", mode: 0o600 });
}

export function writeEnv(path, values) {
  writePrivate(path, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) throw new Error(`Cannot run ${command}: ${result.error.code ?? "unavailable"}.`);
  if (result.status !== 0) throw new Error(`${command} exited ${result.status ?? "without a status"}.`);
  return result;
}

export function docker(args, options = {}) {
  const config = resolve(local, "docker");
  mkdirSync(config, { recursive: true });
  // A dedicated empty configuration avoids using another project's registry credentials.
  writeFileSync(resolve(config, "config.json"), "{}\n");
  return run("docker", ["--config", config, ...args], options);
}

export function compose(args, options = {}) {
  return docker([
    "compose", "--project-name", "rotapress-local", "--file", resolve(root, "compose.yaml"),
    "--env-file", resolve(local, "services.env"), ...args,
  ], options);
}

export function databaseUrl(user, password, database) {
  return `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:55432/${database}`;
}

export function assertLocalDatabase(connection, allowed = databases) {
  const url = new URL(connection);
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55432"
      || !allowed.includes(url.pathname.slice(1))) {
    throw new Error("Refusing database target: only the dedicated RotaPress local database and port are allowed.");
  }
  return url;
}

export async function portAvailable(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
  });
}

export function reportFailure(error) {
  // Database errors can contain connection strings or input values. Never print them.
  const safeMessage = error instanceof Error && !error.code
    ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gu, "[database connection redacted]")
    : `Local operation failed (${error?.code ?? "unknown error"}).`;
  console.error(safeMessage);
  process.exitCode = 1;
}
