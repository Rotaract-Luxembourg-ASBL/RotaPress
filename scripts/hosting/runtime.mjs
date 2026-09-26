// Only these settings reach the non-root web and jobs processes. Installation
// credentials, Docker/provider tokens and the master key stay in the root parent.
const permitted = [
  "APP_URL",
  "ROTAPRESS_PROXY",
  "EMAIL_PROVIDER",
  "EMAIL_FROM_NAME",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_REPLY_TO",
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USERNAME",
  "SMTP_PASSWORD",
  "SMTP_SECURITY",
  "EMAIL_REMOTE_DELIVERY_ENABLED",
  "LUMA_API_REQUESTS_ENABLED",
  "CALENDAR_FEED_REQUESTS_ENABLED",
  "FORM_WEBHOOK_REQUESTS_ENABLED",
];

export function hostedEnvironment(source, credentials) {
  const env = {
    NODE_ENV: "production",
    ROTAPRESS_ENVIRONMENT: "production",
    ROTAPRESS_DEPLOYMENT: "hosted",
    NEXT_TELEMETRY_DISABLED: "1",
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: "/tmp",
    PORT: source.PORT ?? "3000",
    PLAYWRIGHT_BROWSERS_PATH: "/app/.browsers",
    ...credentials,
  };
  for (const key of permitted)
    if (source[key] !== undefined) env[key] = source[key];
  return env;
}
