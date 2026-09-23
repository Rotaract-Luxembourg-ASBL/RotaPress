import { resolve } from "node:path";
import { local, reportFailure, run } from "./local_common.mjs";

try {
  run(process.execPath, ["node_modules/@playwright/test/cli.js", "install", "chromium"], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve(local, "browsers") },
  });
} catch (error) {
  reportFailure(error);
}
