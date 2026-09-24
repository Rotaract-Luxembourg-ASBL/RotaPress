import "server-only";
import { and, eq } from "drizzle-orm";
import { emailConnection } from "../../../db/schema/email";
import type { Database } from "@/infrastructure/database/client";
import { CredentialCipher } from "@/infrastructure/security/CredentialCipher";
import type {
  EmailTransportConnection,
  MailTransport,
  OutgoingEmail,
} from "@/infrastructure/email/EmailTransport";
import { z } from "zod";
import { DomainError } from "@/core/DomainError";

export class EmailDelivery {
  constructor(
    private readonly db: Database,
    readonly cipher: CredentialCipher,
    readonly transport: MailTransport,
    private readonly server: EmailTransportConnection | null,
  ) {}
  serverStatus() {
    return {
      provider:
        this.server?.provider === "local"
          ? ("development" as const)
          : (this.server?.provider ?? null),
      ready: Boolean(
        this.server &&
        (this.server.provider === "local" || this.transport.remoteEnabled),
      ),
      senderName: this.server?.from.name ?? null,
      senderEmail: this.server?.from.address ?? null,
      replyTo: this.server?.replyTo ?? null,
      smtp:
        this.server?.provider === "smtp"
          ? {
              host: this.server.settings.host,
              port: this.server.settings.port,
              username: this.server.settings.username,
            }
          : null,
      hasSecret: Boolean(
        this.server && "secret" in this.server && this.server.secret,
      ),
    };
  }
  requireServerConnection(): EmailTransportConnection {
    if (!this.serverStatus().ready || !this.server)
      throw new DomainError(
        "EMAIL_SETUP_REQUIRED",
        "The server administrator must configure an email sender before sign-in is available.",
        409,
      );
    return this.server;
  }
  connection(
    row: typeof emailConnection.$inferSelect,
  ): EmailTransportConnection {
    const secret = z
      .strictObject({
        value: z.string().min(1).max(256),
        purpose: z.literal("email"),
      })
      .parse(
        JSON.parse(
          this.cipher.open(row.secret, `email:${row.organizationId}:${row.id}`),
        ),
      ).value;
    const sender = {
      from: { name: row.senderName, address: row.senderEmail },
      ...(row.replyTo ? { replyTo: row.replyTo } : {}),
    };
    if (row.provider === "resend")
      return { ...sender, provider: "resend", secret };
    if (!row.smtp) throw new Error("SMTP_CONFIGURATION_REQUIRED");
    return { ...sender, provider: "smtp", settings: row.smtp, secret };
  }
  async send(message: OutgoingEmail, organizationId: string | null) {
    const [row] = organizationId
      ? await this.db
          .select()
          .from(emailConnection)
          .where(
            and(
              eq(emailConnection.organizationId, organizationId),
              eq(emailConnection.isDefault, true),
            ),
          )
      : [];
    // No silent fallback after a selected provider fails; existing outboxes retain retries.
    return this.transport.send(
      row ? this.connection(row) : this.requireServerConnection(),
      message,
    );
  }
  async test(
    message: OutgoingEmail,
    row: typeof emailConnection.$inferSelect | null,
  ) {
    return this.transport.send(
      row ? this.connection(row) : this.requireServerConnection(),
      message,
    );
  }
}
