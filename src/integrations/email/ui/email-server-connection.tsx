import { Icon } from "@/ui/icon";
import type { EmailWorkspace } from "../email_schemas";

export function emailProviderLabel(
  provider: NonNullable<EmailWorkspace["server"]["provider"]>,
) {
  return provider === "resend"
    ? "Resend"
    : provider === "smtp"
      ? "SMTP"
      : "Development capture";
}

export function EmailServerConnection({
  server,
  canManage,
  busy,
  onTest,
  onUse,
}: {
  server: EmailWorkspace["server"];
  canManage: boolean;
  busy: boolean;
  onTest: () => void;
  onUse: () => void;
}) {
  if (!server.provider) return null;
  return (
    <article
      className="panel email-connection-row"
      aria-label="Server email connection"
    >
      <div className="email-provider-mark">
        <Icon name="mail" />
      </div>
      <div className="email-connection-copy">
        <h3>{emailProviderLabel(server.provider)}</h3>
        <p>Managed by server environment</p>
        <div className="email-actions">
          <span className="status-badge">
            {server.isDefault ? "Current sender" : "Not selected"}
          </span>
          {!server.ready && (
            <span className="status-badge">Delivery disabled</span>
          )}
        </div>
      </div>
      {canManage && (
        <div className="email-actions">
          <button
            className="button button-outline"
            disabled={busy || !server.ready}
            onClick={onTest}
          >
            Send test
          </button>
          {!server.isDefault && (
            <button
              className="button button-outline"
              disabled={busy || !server.ready}
              onClick={onUse}
            >
              Test and use server sender
            </button>
          )}
        </div>
      )}
      <dl className="email-server-details">
        <div>
          <dt>Sender</dt>
          <dd>
            {server.senderName} &lt;{server.senderEmail}&gt;
          </dd>
        </div>
        <div>
          <dt>Reply-to</dt>
          <dd>{server.replyTo || "Sender address"}</dd>
        </div>
        {server.smtp && (
          <>
            <div>
              <dt>SMTP host</dt>
              <dd>{server.smtp.host}</dd>
            </div>
            <div>
              <dt>Port and security</dt>
              <dd>
                {server.smtp.port} ·{" "}
                {server.smtp.port === 465 ? "TLS" : "STARTTLS required"}
              </dd>
            </div>
            <div>
              <dt>SMTP username</dt>
              <dd>{server.smtp.username}</dd>
            </div>
          </>
        )}
        {server.provider !== "development" && (
          <div>
            <dt>{server.provider === "resend" ? "API key" : "Password"}</dt>
            <dd>{server.hasSecret ? "Configured" : "Missing"}</dd>
          </div>
        )}
      </dl>
      <p className="muted email-connection-help">
        {!server.ready
          ? "This connection is configured, but sending is disabled on the server. "
          : !server.isDefault
            ? "Your selected admin connection is used for delivery. "
            : server.provider === "development"
              ? "Development only. Messages do not reach a real inbox. "
              : "This server connection is used for delivery. "}
        Update these settings in the server environment and restart the
        application and job runner.
        {canManage &&
          " To manage a sender here instead, add a connection, test it and choose Use as sender."}
      </p>
    </article>
  );
}
