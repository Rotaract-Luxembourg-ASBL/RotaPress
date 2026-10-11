"use client";
import { useState } from "react";
import Link from "next/link";
import { ApiError, errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import {
  Collection,
  CollectionRow,
  CollectionEmpty,
  CollectionToolbar,
  StatusBadge,
} from "@/ui/collection";
import { ActionsMenu } from "@/ui/actions-menu";
import { Dialog } from "@/ui/dialog";
import { ConnectionEditor } from "./connection-editor";
import {
  oauthEndpoint,
  connectionStatus,
  ConnectionTime,
  type OAuthClient,
} from "./connection-types";

export function ExistingConnections({ onCreate }: { onCreate: () => void }) {
  const { data, error, refresh } = useResource<{ clients: OAuthClient[] }>(
    oauthEndpoint,
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{
    client: OAuthClient;
    tab: "Permissions" | "Activity";
  }>();
  const [change, setChange] = useState<{
    client: OAuthClient;
    action: "revoke" | "remove";
  }>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [problemStatus, setProblemStatus] = useState<number>();
  const [receipt, setReceipt] = useState<string>();
  const clients =
    data?.clients.filter((client) =>
      `${client.name ?? "OAuth connection"} ${client.redirectUris.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
    ) ?? [];
  async function applyChange() {
    if (!change || busy) return;
    setBusy(true);
    setProblem(undefined);
    setProblemStatus(undefined);
    try {
      await request(oauthEndpoint, {
        method: "DELETE",
        body: JSON.stringify({
          clientId: change.client.clientId,
          action: change.action,
          expectedRevision: change.client.permissionsRevision,
          confirmed: true,
        }),
      });
      const name = change.client.name ?? "OAuth connection";
      setReceipt(
        change.action === "revoke"
          ? `Access revoked for ${name}. Reconnect from your AI app to review access again.`
          : `Removed ${name}. Create a new connection to use this app again.`,
      );
      setChange(undefined);
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
      setProblemStatus(cause instanceof ApiError ? cause.status : undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="oauth-existing" aria-labelledby="oauth-existing-title">
      <header className="oauth-existing-heading">
        <div>
          <h2 id="oauth-existing-title">Your OAuth connections</h2>
          <p className="muted">
            Review access, change permissions and see what your assistants have
            done.
          </p>
        </div>
        <button className="button button-accent" onClick={onCreate}>
          New OAuth connection
        </button>
      </header>
      {receipt && <Notice kind="success">{receipt}</Notice>}
      {error ? (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Reload connections
          </button>
        </Notice>
      ) : !data ? (
        <Loading />
      ) : (
        <Collection
          label="OAuth connections"
          noun="Connection"
          detailLabel="Last tool activity"
          toolbar={
            <CollectionToolbar
              searchLabel="Search connections"
              query={query}
              onQuery={setQuery}
            >
              <button className="button button-outline" onClick={refresh}>
                Refresh connections
              </button>
            </CollectionToolbar>
          }
          footer={`${clients.length} of ${data.clients.length} connections shown · latest 100 registered by you`}
        >
          {!clients.length ? (
            <CollectionEmpty
              icon="controls"
              title={
                query ? "No matching connections" : "No OAuth connections yet"
              }
              description={
                query
                  ? "Try another name or callback website."
                  : "Create a connection, then approve access from your AI app."
              }
            >
              {query && (
                <button
                  className="button button-outline"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              )}
            </CollectionEmpty>
          ) : (
            <ul className="admin-collection-rows">
              {clients.map((client) => (
                <CollectionRow
                  key={client.clientId}
                  title={client.name ?? "OAuth connection"}
                  description={
                    <>
                      {client.scopes.length} allowed actions ·{" "}
                      {client.approvedScopes.length} approved
                      <br />
                      <span>
                        Created <ConnectionTime value={client.createdAt} />
                      </span>
                    </>
                  }
                  status={
                    <StatusBadge
                      tone={client.consentedAt ? "success" : "warning"}
                    >
                      {connectionStatus(client)}
                    </StatusBadge>
                  }
                  detail={{
                    label: "Last tool activity",
                    value: (
                      <ConnectionTime
                        value={client.lastUsedAt}
                        empty="No activity recorded"
                      />
                    ),
                  }}
                  actions={
                    <>
                      <button
                        className="button button-outline button-small"
                        disabled={client.disabled}
                        aria-label={`Permissions for ${client.name ?? "OAuth connection"}`}
                        onClick={() =>
                          setSelected({ client, tab: "Permissions" })
                        }
                      >
                        Permissions
                      </button>
                      <button
                        className="button button-outline button-small"
                        disabled={client.disabled}
                        aria-label={`Activity for ${client.name ?? "OAuth connection"}`}
                        onClick={() => setSelected({ client, tab: "Activity" })}
                      >
                        Activity
                      </button>
                      {!client.disabled && (
                        <ActionsMenu
                          label={`More options for ${client.name ?? "OAuth connection"}`}
                        >
                          <button
                            aria-label={`Revoke access for ${client.name ?? "OAuth connection"}`}
                            onClick={() => {
                              setProblem(undefined);
                              setProblemStatus(undefined);
                              setChange({ client, action: "revoke" });
                            }}
                          >
                            Revoke access
                          </button>
                          <button
                            aria-label={`Remove ${client.name ?? "OAuth connection"}`}
                            onClick={() => {
                              setProblem(undefined);
                              setProblemStatus(undefined);
                              setChange({ client, action: "remove" });
                            }}
                          >
                            Remove connection
                          </button>
                        </ActionsMenu>
                      )}
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </Collection>
      )}
      <p className="small muted">
        Consent saved means you approved access. Actual access also requires MCP
        to be enabled and your sign-in and staff permissions to remain valid.
      </p>
      {selected && (
        <ConnectionEditor
          key={selected.client.clientId}
          client={selected.client}
          initialTab={selected.tab}
          onClose={() => setSelected(undefined)}
          onSaved={refresh}
        />
      )}
      {change && (
        <Dialog
          title={`${change.action === "revoke" ? "Revoke access for" : "Remove"} ${change.client.name ?? "OAuth connection"}?`}
          onClose={() => setChange(undefined)}
          canClose={() => !busy}
        >
          <p>
            {change.action === "revoke"
              ? "This stops the assistant's current access and clears its saved consent. Its client ID, secret and callback stay the same. Reconnect from your AI app and review access again. Your club content is kept."
              : "This stops the assistant's access and permanently removes its registration. Its client ID and secret will no longer work. To connect again, create a new OAuth connection and update the details in your AI app. Your club content is kept."}
          </p>
          {problem && (
            <Notice>
              {problem}
              {problemStatus === 401 && (
                <Link
                  href="/sign-in?reauth=1&next=%2Fadmin%2Fintegrations%2Fmcp"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Sign in again in a new tab, then retry
                </Link>
              )}
              {problemStatus === 409 && (
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => {
                    setChange(undefined);
                    refresh();
                  }}
                >
                  Reload connections
                </button>
              )}
            </Notice>
          )}
          <div className="actions">
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => setChange(undefined)}
            >
              Keep connection
            </button>
            <button
              className="button button-danger"
              disabled={busy}
              onClick={() => void applyChange()}
            >
              {busy
                ? change.action === "revoke"
                  ? "Revoking…"
                  : "Removing…"
                : change.action === "revoke"
                  ? "Revoke access"
                  : "Remove connection"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
