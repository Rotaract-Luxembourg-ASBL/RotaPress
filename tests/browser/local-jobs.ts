import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv, promisify } from "node:util";
import { z } from "zod";
import { startLumaFixture } from "./luma-provider-fixture.mjs";

const receipt = z.object({
  event: z.string(),
  processed: z.number(),
  sent: z.number().optional(),
  published: z.number().optional(),
  succeeded: z.number().optional(),
});
/** Real process invocations, restricted to the isolated test database and Mailpit. */
export async function runLocalTestJobs(origin: string, lumaFixture = false) {
  const test = parseEnv(await readFile(".local/test.env", "utf8"));
  const local = parseEnv(await readFile(".env.local", "utf8"));
  if (!test.DATABASE_URL)
    throw new Error("Run local test setup before browser jobs.");
  const target = new URL(test.DATABASE_URL);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "55432" ||
    target.pathname !== "/rotapress_test" ||
    target.username !== "rotapress_app"
  )
    throw new Error(
      "Browser jobs require the disposable local test database, restricted runtime role and Mailpit.",
    );
  if (
    lumaFixture &&
    !/^[a-f0-9]{64}$/.test(process.env.ROTAPRESS_TEST_ENCRYPTION_KEY ?? "")
  )
    throw new Error("Browser fixture key is required.");
  const fixture = lumaFixture ? await startLumaFixture() : undefined;
  try {
    const result = await promisify(execFile)(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "scripts/jobs.ts"],
      {
        windowsHide: true,
        timeout: 30_000,
        env: {
          ...process.env,
          ...local,
          DATABASE_URL: test.DATABASE_URL,
          APP_URL: origin,
          LUMA_API_REQUESTS_ENABLED: "false",
          FORM_WEBHOOK_REQUESTS_ENABLED: "false",
          CALENDAR_FEED_REQUESTS_ENABLED: "false",
          EMAIL_REMOTE_DELIVERY_ENABLED: "false",
          LUMA_FIXTURE_ORIGIN: fixture?.origin,
          INTEGRATION_ENCRYPTION_KEY: lumaFixture
            ? process.env.ROTAPRESS_TEST_ENCRYPTION_KEY
            : local.INTEGRATION_ENCRYPTION_KEY,
        },
      },
    );
    return result.stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => receipt.parse(JSON.parse(line)));
  } catch {
    // Node's exec errors can include the child environment; never propagate those.
    throw new Error(
      "The project job command failed during the guarded browser check.",
    );
  } finally {
    fixture?.close();
  }
}
