import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { smokeOrigin } from "./scripts/smoke_origin.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
// Shared by the isolated browser app and fresh worker processes; never persisted or logged.
process.env.ROTAPRESS_TEST_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  use: { baseURL: smokeOrigin, browserName: "chromium", trace: "off", screenshot: "off", video: "off" },
  webServer: {
    command: "node scripts/smoke_server.mjs",
    url: `${smokeOrigin}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
