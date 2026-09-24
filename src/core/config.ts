import "server-only";
import { z } from "zod";
import { serverEmailConfiguration } from "@/infrastructure/email/server_email_configuration";

const schema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_URL: z.url().default("http://127.0.0.1:3000"),
  INTEGRATION_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  LUMA_API_REQUESTS_ENABLED: z.enum(["true", "false"]).default("false"),
  FORM_WEBHOOK_REQUESTS_ENABLED: z.enum(["true", "false"]).default("false"),
  CALENDAR_FEED_REQUESTS_ENABLED: z.enum(["true", "false"]).default("false"),
  EMAIL_REMOTE_DELIVERY_ENABLED: z.enum(["true", "false"]).default("false"),
  LUMA_FIXTURE_ORIGIN: z.url().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Invalid local configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}. Run pnpm setup.`,
  );
}
export const config = parsed.data;
export const serverEmail = serverEmailConfiguration(
  process.env,
  config.APP_URL,
  config.DATABASE_URL,
);
const database = new URL(config.DATABASE_URL);
if (config.LUMA_FIXTURE_ORIGIN && database.pathname !== "/rotapress_test") {
  throw new Error("Provider fixtures require the disposable test database.");
}
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
  !["/rotapress", "/rotapress_test"].includes(database.pathname) ||
  database.username !== "rotapress_app"
) {
  throw new Error(
    "This local release requires a dedicated local RotaPress database and the restricted runtime role.",
  );
}
if (!["127.0.0.1", "localhost"].includes(new URL(config.APP_URL).hostname)) {
  throw new Error("This local release requires a loopback application origin.");
}
