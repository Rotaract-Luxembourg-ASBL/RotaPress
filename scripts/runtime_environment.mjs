import { randomBytes } from "node:crypto";
import { readEnv, writeEnv } from "./local_common.mjs";

/** Never replace a lost key while any feature still has encrypted saved data.
 * @param {string} runtimePath
 * @param {import("pg").Client | import("pg").Pool} client
 */
export async function ensureIntegrationKey(runtimePath, client) {
  const config = readEnv(runtimePath);
  if (config.INTEGRATION_ENCRYPTION_KEY) return;
  const saved = await client.query(`SELECT
    EXISTS (SELECT 1 FROM club.luma_connection WHERE credential IS NOT NULL)
    OR EXISTS (SELECT 1 FROM club.luma_webhook WHERE secret IS NOT NULL)
    OR EXISTS (SELECT 1 FROM club.google_auth_configuration WHERE client_secret IS NOT NULL)
    OR EXISTS (SELECT 1 FROM club.form_webhook)
    OR EXISTS (SELECT 1 FROM club.email_connection)
    OR EXISTS (SELECT 1 FROM club.calendar_source)
    AS present`);
  if (saved.rows[0].present)
    throw new Error(
      "Restore the existing integration encryption key before setup; saved credentials were preserved.",
    );
  writeEnv(runtimePath, {
    ...config,
    INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  });
}
