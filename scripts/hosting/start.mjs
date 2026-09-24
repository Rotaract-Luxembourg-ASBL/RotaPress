import { spawn } from "node:child_process";
import { chmod, chown, lstat, mkdir } from "node:fs/promises";
import { prepareHostedDatabase } from "./database.mjs";
import { hostedEnvironment } from "./runtime.mjs";
import { runtimeConfiguration } from "../../src/core/runtime_configuration.ts";
import { serverEmailConfiguration } from "../../src/infrastructure/email/server_email_configuration.ts";

const children = new Set();
let stopping = false;
let timer;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const deadline = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 20_000);
  deadline.unref();
}

function child(args, env) {
  const running = spawn(process.execPath, args, {
    cwd: "/app",
    env,
    uid: 10001,
    gid: 10001,
    stdio: "inherit",
  });
  children.add(running);
  running.once("exit", () => children.delete(running));
  running.once("error", () => stop(1));
  return running;
}

async function main() {
  if (
    process.platform !== "linux" ||
    process.getuid() !== 0 ||
    process.cwd() !== "/app"
  )
    throw new Error("HOSTING_CONTAINER_REQUIRED");
  if (process.env.ROTAPRESS_DEPLOYMENT !== "hosted")
    throw new Error("HOSTING_MODE_REQUIRED");
  const port = process.env.PORT ?? "3000";
  if (!/^\d{2,5}$/u.test(port) || Number(port) > 65535)
    throw new Error("HOSTING_PORT_INVALID");
  // Fail configuration before touching a database. The real restricted URL is
  // supplied only after bootstrap; these placeholders are never used to connect.
  runtimeConfiguration({
    ...process.env,
    DATABASE_URL: "postgresql://rotapress_app:unused@database/rotapress",
    BETTER_AUTH_SECRET: "validation-only-placeholder-00000000",
    INTEGRATION_ENCRYPTION_KEY: "0".repeat(64),
  });
  const email = serverEmailConfiguration(
    process.env,
    process.env.APP_URL,
    "postgresql://rotapress_app:unused@database/rotapress",
  );
  if (!email.connection || !email.remoteEnabled || email.localEnabled)
    throw new Error("HOSTING_EMAIL_REQUIRED");
  const credentials = await prepareHostedDatabase({
    bootstrapUrl: process.env.BOOTSTRAP_DATABASE_URL,
    secret: process.env.ROTAPRESS_HOSTING_KEY,
    ownerEmail: process.env.ROTAPRESS_OWNER_EMAIL,
    claim: process.env.ROTAPRESS_SETUP_CLAIM,
  });
  if (stopping) return;
  for (const directory of [
    "/app/.data",
    "/app/.data/uploads",
    "/app/.next/cache",
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("HOSTING_STORAGE_UNSAFE");
    await chown(directory, 10001, 10001);
    await chmod(directory, 0o700);
  }
  const env = hostedEnvironment(process.env, credentials);
  runtimeConfiguration(env);
  const web = child(
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "0.0.0.0",
      "--port",
      port,
    ],
    env,
  );
  web.once("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
  function jobs() {
    if (stopping) return;
    const worker = child(
      ["--conditions=react-server", "--import", "tsx", "scripts/jobs.ts"],
      env,
    );
    const deadline = setTimeout(() => worker.kill("SIGTERM"), 240_000);
    const kill = setTimeout(() => worker.kill("SIGKILL"), 260_000);
    worker.once("exit", (code) => {
      clearTimeout(deadline);
      clearTimeout(kill);
      if (!stopping) {
        if (code !== 0) console.error('{"event":"jobs_batch_failed"}');
        timer = setTimeout(jobs, 30_000);
      }
    });
  }
  timer = setTimeout(jobs, 5000);
  console.log('{"event":"hosting_started","migrations":"complete"}');
}

process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());
main().catch((error) => {
  const code = /^HOSTING_[A-Z0-9_]+$/u.test(error?.message)
    ? error.message
    : "HOSTING_START_FAILED";
  console.error(JSON.stringify({ event: "hosting_start_failed", code }));
  stop(1);
});
