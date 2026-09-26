import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { startLumaFixture } from "../tests/browser/luma-provider-fixture.mjs";
import { smokePort, smokeOrigin } from "./smoke_origin.mjs";
import { compose } from "./local_common.mjs";

const test = parseEnv(readFileSync(".local/test.env", "utf8"));
const local = parseEnv(readFileSync(".env.local", "utf8"));
const url = new URL(test.DATABASE_URL);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55432" ||
  url.pathname !== "/rotapress_test"
) {
  throw new Error(
    "Browser checks require the dedicated disposable local test database.",
  );
}
const fixture = await startLumaFixture();
compose(["--profile", "development", "up", "--detach", "--wait", "mailpit"]);
if (!/^[a-f0-9]{64}$/.test(process.env.ROTAPRESS_TEST_ENCRYPTION_KEY ?? ""))
  throw new Error("Browser fixture key is required.");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    smokePort,
  ],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ...local,
      DATABASE_URL: test.DATABASE_URL,
      APP_URL: smokeOrigin,
      PORT: smokePort,
      INTEGRATION_ENCRYPTION_KEY: process.env.ROTAPRESS_TEST_ENCRYPTION_KEY,
      LUMA_API_REQUESTS_ENABLED: "false",
      FORM_WEBHOOK_REQUESTS_ENABLED: "false",
      CALENDAR_FEED_REQUESTS_ENABLED: "false",
      EMAIL_REMOTE_DELIVERY_ENABLED: "false",
      ROTAPRESS_ENVIRONMENT: "test",
      EMAIL_PROVIDER: "development",
      LUMA_FIXTURE_ORIGIN: fixture.origin,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  fixture.close();
  process.exitCode = code ?? 1;
});
