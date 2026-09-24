import "server-only";
import { z } from "zod";
import { connectionSaveSchema } from "@/integrations/email/email_schemas";
import type { EmailTransportConnection } from "./EmailTransport";

const environmentSchema = z.object({
  ROTAPRESS_ENVIRONMENT: z
    .enum(["production", "development", "test"])
    .default("production"),
  EMAIL_PROVIDER: z
    .enum(["disabled", "smtp", "resend", "development"])
    .default("disabled"),
  EMAIL_REMOTE_DELIVERY_ENABLED: z.enum(["true", "false"]).default("false"),
});

/** Server credentials exist before the first owner, never in a public setup form. */
export function serverEmailConfiguration(
  env: Record<string, string | undefined>,
  appUrl: string,
  databaseUrl: string,
): {
  connection: EmailTransportConnection | null;
  remoteEnabled: boolean;
  localEnabled: boolean;
} {
  const parsed = environmentSchema.safeParse(env);
  if (!parsed.success)
    throw new Error("Invalid server email environment settings.");
  const settings = parsed.data;
  const remoteEnabled = settings.EMAIL_REMOTE_DELIVERY_ENABLED === "true";
  if (settings.EMAIL_PROVIDER === "disabled")
    return { connection: null, remoteEnabled, localEnabled: false };
  if (settings.EMAIL_PROVIDER === "development") {
    const database = new URL(databaseUrl);
    if (
      settings.ROTAPRESS_ENVIRONMENT === "production" ||
      !["127.0.0.1", "localhost"].includes(new URL(appUrl).hostname) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
      !["/rotapress", "/rotapress_test"].includes(database.pathname) ||
      (settings.ROTAPRESS_ENVIRONMENT === "test" &&
        database.pathname !== "/rotapress_test")
    )
      throw new Error(
        "Development email requires an explicit local development or test environment.",
      );
    return {
      remoteEnabled,
      localEnabled: true,
      connection: {
        provider: "local",
        host: "127.0.0.1",
        port: 11025,
        from: {
          name: "RotaPress development",
          address: "noreply@example.test",
        },
      },
    };
  }
  const connection = connectionSaveSchema.safeParse({
    expectedVersion: 0,
    name: "Server sender",
    provider: settings.EMAIL_PROVIDER,
    senderName: env.EMAIL_FROM_NAME || "RotaPress",
    senderEmail: env.EMAIL_FROM_ADDRESS,
    replyTo: env.EMAIL_REPLY_TO || "",
    secret:
      settings.EMAIL_PROVIDER === "resend"
        ? env.RESEND_API_KEY
        : env.SMTP_PASSWORD,
    smtp:
      settings.EMAIL_PROVIDER === "smtp"
        ? {
            host: env.SMTP_HOST,
            port: Number(env.SMTP_PORT),
            username: env.SMTP_USERNAME,
          }
        : null,
  });
  if (!connection.success || !connection.data.secret)
    // Do not include Zod input, provider credentials or environment values in startup errors.
    throw new Error(
      "Server email configuration is incomplete or invalid. Check the email setup guide.",
    );
  const value = connection.data;
  const sender = {
    from: { name: value.senderName, address: value.senderEmail },
    ...(value.replyTo ? { replyTo: value.replyTo } : {}),
  };
  return {
    remoteEnabled,
    localEnabled: false,
    connection:
      value.provider === "smtp"
        ? {
            ...sender,
            provider: "smtp",
            settings: value.smtp!,
            secret: value.secret!,
          }
        : { ...sender, provider: "resend", secret: value.secret! },
  };
}
