import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { root } from "./local_common.mjs";

let port;
try {
  process.loadEnvFile(resolve(root, ".env.local"));
  const origin = new URL(process.env.APP_URL);
  port = process.env.PORT || origin.port || "3000";
  if (
    !["127.0.0.1", "localhost"].includes(origin.hostname) ||
    !Number.isInteger(Number(port)) ||
    Number(port) < 1 ||
    Number(port) > 65535
  )
    throw new Error("INVALID_LOCAL_CONFIGURATION");
} catch {
  console.error(
    "Local development configuration is unavailable. Run pnpm setup.",
  );
  process.exit(1);
}

const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    cwd: root,
  },
);
let job;
let stopping = false;
function runJobs() {
  if (stopping || job) return;
  job = spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/jobs.ts"],
    {
      stdio: "inherit",
      windowsHide: true,
      cwd: root,
    },
  );
  job.on("error", () => {
    console.error("Local job invocation could not start.");
    job = undefined;
  });
  job.on("exit", () => {
    job = undefined;
  });
}
const interval = setInterval(runJobs, 30_000);
const initial = setTimeout(runJobs, 5_000);
function stopChild(child, signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (process.platform === "win32") {
    // Windows does not forward POSIX signals through Next's child process.
    // Terminate only the tree rooted at a process created by this launcher.
    const cleanup = spawn(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );
    cleanup.on("error", () => child.kill());
  } else child.kill(signal);
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(interval);
  clearTimeout(initial);
  stopChild(job, signal);
  stopChild(app, signal);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stop(signal));
app.on("error", () => {
  console.error("Local application could not start.");
  stop("SIGTERM");
  process.exitCode = 1;
});
app.on("exit", (code) => {
  stop("SIGTERM");
  process.exitCode = code ?? 0;
});
