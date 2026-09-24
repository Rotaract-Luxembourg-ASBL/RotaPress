"use client";
import { IntegrationCard } from "@/integrations/ui/integration-card";
import { useResource } from "@/ui/api";
import type { EmailWorkspace } from "../email_schemas";
import { emailProviderLabel } from "./email-server-connection";
export function EmailIntegrationCard() {
  const { data, error } = useResource<EmailWorkspace>(
    "/api/admin/integrations/email",
  );
  const selected = data?.connections.find((c) => c.isDefault);
  const server = data?.server;
  return (
    <IntegrationCard
      name="Email"
      category="Communication"
      icon="mail"
      description="Connect Resend or SMTP, choose your sender and design the emails your community receives."
      enabled={Boolean(selected ? data?.remoteEnabled : data?.server.ready)}
      state={
        error
          ? "Unavailable"
          : !data
            ? "Loading…"
            : selected
              ? data.remoteEnabled
                ? "Connected"
                : "Delivery disabled"
              : !data.server.provider
                ? "Setup required"
                : !data.server.ready
                  ? "Delivery disabled"
                  : data.server.provider === "development"
                    ? "Development only"
                    : "Server configured"
      }
      settingsHref="/admin/integrations/email"
      settingsLabel="Open"
      connection={
        <span>
          {selected?.name ??
            (server?.provider
              ? `${emailProviderLabel(server.provider)} · Server environment`
              : "No sender configured")}
          {(selected?.senderEmail || server?.senderEmail) && (
            <>
              <br />
              {selected?.senderEmail ?? server?.senderEmail}
            </>
          )}
        </span>
      }
    >
      <span className="integration-detail-label">
        Connections · Templates · Unsubscribe
      </span>
    </IntegrationCard>
  );
}
