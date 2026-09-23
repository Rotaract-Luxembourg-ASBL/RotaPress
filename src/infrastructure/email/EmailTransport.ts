import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import nodemailer from "nodemailer";
import { isPublicWebhookAddress } from "../http/WebhookClient";
import {
  smtpSettingsSchema,
  type SmtpSettings,
} from "@/integrations/email/email_schemas";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
};
export type EmailSender = {
  from: { name: string; address: string };
  replyTo?: string;
};
export type EmailTransportConnection = EmailSender &
  (
    | { provider: "local"; host: string; port: number }
    | { provider: "smtp"; settings: SmtpSettings; secret: string }
    | { provider: "resend"; secret: string }
  );
export interface MailTransport {
  readonly remoteEnabled: boolean;
  send(
    connection: EmailTransportConnection,
    message: OutgoingEmail,
  ): Promise<void>;
}

/** Explicit provider registry. Connections cannot supply code, URLs, proxies or TLS overrides. */
export class EmailTransport implements MailTransport {
  constructor(
    readonly remoteEnabled: boolean,
    private readonly resolve = (host: string) =>
      lookup(host, { all: true, family: 4 }),
    private readonly request: typeof fetch = fetch,
  ) {}
  private async address(host: string) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      this.resolve(host),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("MAIL_DNS_TIMEOUT")), 3000);
      }),
    ]).finally(() => clearTimeout(timeout));
    if (
      !addresses.length ||
      addresses.some(
        (a) => a.family !== 4 || !isPublicWebhookAddress(a.address),
      )
    )
      throw new Error("MAIL_ADDRESS_BLOCKED");
    return addresses[0].address;
  }
  async send(connection: EmailTransportConnection, message: OutgoingEmail) {
    try {
      if (connection.provider !== "local" && !this.remoteEnabled)
        throw new Error("REMOTE_EMAIL_DISABLED");
      if (connection.provider === "resend") {
        const response = await this.request("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
          headers: {
            authorization: `Bearer ${connection.secret}`,
            "content-type": "application/json",
            "idempotency-key": createHash("sha256")
              .update(message.messageId)
              .digest("hex"),
          },
          body: JSON.stringify({
            from: `${connection.from.name.replace(/["<>\\]/g, "")} <${connection.from.address}>`,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(connection.replyTo ? { reply_to: connection.replyTo } : {}),
            headers: { "Message-ID": message.messageId },
          }),
        });
        // Never forward the provider's response: it may echo credentials or recipients.
        await response.body?.cancel();
        if (response.status !== 200) throw new Error("RESEND_DELIVERY_FAILED");
        return;
      }
      const smtp =
        connection.provider === "smtp"
          ? smtpSettingsSchema.parse(connection.settings)
          : null;
      if (
        connection.provider === "local" &&
        !["127.0.0.1", "localhost"].includes(connection.host)
      )
        throw new Error("LOCAL_MAIL_HOST_REQUIRED");
      const host = smtp ? await this.address(smtp.host) : "127.0.0.1";
      const transport = nodemailer.createTransport({
        host,
        port:
          smtp?.port ?? (connection.provider === "local" ? connection.port : 0),
        secure: smtp?.port === 465,
        requireTLS: Boolean(smtp),
        ignoreTLS: !smtp,
        ...(smtp && connection.provider === "smtp"
          ? {
              auth: { user: smtp.username, pass: connection.secret },
              tls: {
                servername: smtp.host,
                rejectUnauthorized: true,
                minVersion: "TLSv1.2" as const,
              },
            }
          : {}),
        disableFileAccess: true,
        disableUrlAccess: true,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        logger: false,
        debug: false,
      });
      try {
        await transport.sendMail({
          ...message,
          from: connection.from,
          replyTo: connection.replyTo,
        });
      } finally {
        transport.close();
      }
    } catch {
      throw new Error("MAIL_DELIVERY_UNAVAILABLE");
    }
  }
}
