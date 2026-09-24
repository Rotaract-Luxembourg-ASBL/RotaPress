import { z } from "zod";

const schema = z.object({
  ROTAPRESS_DEPLOYMENT: z.enum(["local", "hosted"]).default("local"),
  ROTAPRESS_PROXY: z.enum(["none", "trusted"]).default("none"),
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

/** Startup policy is explicit; hosting never relaxes development/test targeting. */
export function runtimeConfiguration(env: Record<string, string | undefined>) {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid server configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}.`,
    );
  const config = parsed.data;
  const database = new URL(config.DATABASE_URL);
  const origin = new URL(config.APP_URL);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.username !== "rotapress_app"
  )
    throw new Error("Use the restricted RotaPress runtime database account.");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error(
      "APP_URL must be the website origin, without credentials, a path or a query.",
    );
  const loopbackDatabase = ["localhost", "127.0.0.1", "[::1]"].includes(
    database.hostname,
  );
  const loopbackOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  if (config.ROTAPRESS_DEPLOYMENT === "local") {
    if (
      !loopbackDatabase ||
      !["/rotapress", "/rotapress_test"].includes(database.pathname)
    )
      throw new Error(
        "This local release requires a dedicated local RotaPress database.",
      );
    if (!loopbackOrigin || config.ROTAPRESS_PROXY !== "none")
      throw new Error(
        "Local development requires a loopback application origin without a proxy.",
      );
    if (config.LUMA_FIXTURE_ORIGIN && database.pathname !== "/rotapress_test")
      throw new Error(
        "Provider fixtures require the disposable test database.",
      );
  } else {
    if (
      origin.protocol !== "https:" ||
      loopbackOrigin ||
      !origin.hostname.includes(".")
    )
      throw new Error(
        "Hosted RotaPress requires the public HTTPS website address.",
      );
    if (
      database.pathname !== "/rotapress" ||
      !config.INTEGRATION_ENCRYPTION_KEY
    )
      throw new Error(
        "Hosted RotaPress requires its dedicated database and encryption key.",
      );
    if (
      config.LUMA_FIXTURE_ORIGIN ||
      env.EMAIL_PROVIDER === "development" ||
      (env.ROTAPRESS_ENVIRONMENT && env.ROTAPRESS_ENVIRONMENT !== "production")
    )
      throw new Error(
        "Development providers and fixtures cannot run in a hosted installation.",
      );
  }
  return { ...config, APP_URL: origin.origin };
}
