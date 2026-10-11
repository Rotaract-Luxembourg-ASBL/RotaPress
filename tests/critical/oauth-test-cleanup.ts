import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import type { OAuthConnections } from "../../src/integrations/automation/oauth/OAuthConnections";

/** Cleanup explicitly removes the current synthetic registration, not its grant. */
export async function removeOAuthConnection(
  connections: OAuthConnections,
  actor: TrustedActor,
  headers: Headers,
  clientId: string,
) {
  const current = (await connections.list(actor)).find(
    (client) => client.clientId === clientId,
  );
  if (!current) throw new Error("Synthetic OAuth connection unavailable.");
  return connections.remove(
    actor,
    headers,
    clientId,
    current.permissionsRevision,
  );
}
