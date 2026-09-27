import type { AutomationScope } from "../scopes";

export const oauthEndpoint = "/api/admin/integrations/automation/oauth";
export type OAuthClient = {
  clientId: string;
  name: string | null;
  disabled: boolean;
  redirectUris: string[];
  scopes: AutomationScope[];
  sourceOrigins: string[];
  authentication: string;
  createdAt: string | null;
  permissionsRevision: string;
  approvedScopes: AutomationScope[];
  consentedAt: string | null;
  lastUsedAt: string | null;
};
export type OAuthActivity = { id: string; action: string; at: string };

export function connectionStatus(client: OAuthClient) {
  if (client.disabled) return "Revoked";
  if (client.consentedAt) return "Consent saved";
  return client.permissionsRevision === "initial"
    ? "Awaiting consent"
    : "Reconnect required";
}

export function ConnectionTime({
  value,
  empty = "Not recorded",
}: {
  value: string | null;
  empty?: string;
}) {
  if (!value) return <span>{empty}</span>;
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })}
    </time>
  );
}
