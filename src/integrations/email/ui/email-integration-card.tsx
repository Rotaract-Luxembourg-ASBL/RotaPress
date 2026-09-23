"use client";
import { IntegrationCard } from "@/integrations/ui/integration-card";
import { useResource } from "@/ui/api";
import type { EmailWorkspace } from "../email_schemas";
export function EmailIntegrationCard() {
  const { data, error } = useResource<EmailWorkspace>(
    "/api/admin/integrations/email",
  );
  const selected = data?.connections.find((c) => c.isDefault);
  return (
    <IntegrationCard
      name="Email"
      category="Communication"
      icon="mail"
      description="Connect Resend or SMTP, choose your sender and design the emails your community receives."
      enabled={Boolean(data)}
      state={
        error
          ? "Unavailable"
          : !data
            ? "Loading…"
            : selected
              ? "Connected"
              : "Local capture"
      }
      settingsHref="/admin/integrations/email"
      settingsLabel="Open"
      connection={<span>{selected?.name ?? "Local Mailpit capture"}</span>}
    >
      <span className="integration-detail-label">
        Connections · Templates · Unsubscribe
      </span>
    </IntegrationCard>
  );
}
