"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { scopeDefinitions, type AutomationScope } from "../scopes";
import { ScopePicker } from "../ui/scope-picker";
import { ReferenceOrigins } from "../ui/reference-origins";
import {
  defaultOAuthSetup,
  type OAuthPlatform,
  type OAuthSetup,
} from "./client-presets";
import { OAuthSetupFields } from "./oauth-setup-fields";
import {
  OAuthIssuedDetails,
  type IssuedOAuthClient,
} from "./oauth-issued-details";

const endpoint = "/api/admin/integrations/automation/oauth";
type OAuthClient = {
  clientId: string;
  name: string | null;
  disabled: boolean;
  redirectUris: string[];
  scopes: string[];
  sourceOrigins: string[];
  authentication: string;
};

export function OAuthSettings() {
  const { data, error, refresh } = useResource<{ clients: OAuthClient[] }>(
    endpoint,
  );
  const [platform, setPlatform] = useState<OAuthPlatform>("chatgpt");
  const [setups, setSetups] = useState<Record<OAuthPlatform, OAuthSetup>>(
    () => ({
      chatgpt: defaultOAuthSetup("chatgpt"),
      claude: defaultOAuthSetup("claude"),
      custom: defaultOAuthSetup("custom"),
    }),
  );
  const setup = setups[platform];
  const [origins, setOrigins] = useState("");
  const [scopes, setScopes] = useState<AutomationScope[]>(["website:read"]);
  const [issued, setIssued] = useState<IssuedOAuthClient>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || issued) return;
    setBusy(true);
    setProblem(undefined);
    setReceipt(undefined);
    try {
      setIssued(
        await request<IssuedOAuthClient>(endpoint, {
          method: "POST",
          body: JSON.stringify({
            name: setup.name,
            redirectUris: setup.redirects.split(/\s+/).filter(Boolean),
            authentication: setup.authentication,
            scopes,
            sourceOrigins: scopes.includes("sources:read")
              ? origins
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((origin) => origin.replace(/\/$/, ""))
              : [],
          }),
        }),
      );
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(client: OAuthClient) {
    if (busy) return;
    setBusy(true);
    setProblem(undefined);
    try {
      await request(endpoint, {
        method: "DELETE",
        body: JSON.stringify({ clientId: client.clientId }),
      });
      if (issued?.clientId === client.clientId) setIssued(undefined);
      setReceipt(`Revoked ${client.name ?? "OAuth connection"}.`);
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel oauth-settings"
      aria-labelledby="oauth-settings-title"
    >
      <h2 id="oauth-settings-title">Connect with OAuth</h2>
      <p>
        Choose your AI app and its allowed actions. We'll prepare the connection
        details to copy into the app, then you'll sign in and approve access.
      </p>
      <p className="muted">
        A sign-in within the last 15 minutes is required to create a connection.{" "}
        <Link href="/sign-in?reauth=1&next=/admin/integrations/mcp">
          Sign in again
        </Link>
      </p>
      {(problem || error) && <Notice>{problem || error}</Notice>}
      {receipt && <Notice kind="success">{receipt}</Notice>}
      <form className="automation-form" onSubmit={create} hidden={!!issued}>
        <OAuthSetupFields
          platform={platform}
          onPlatformChange={setPlatform}
          value={setup}
          onChange={(value) =>
            setSetups((previous) => ({ ...previous, [platform]: value }))
          }
          disabled={busy}
        />
        <ScopePicker
          legend="OAuth allowed actions"
          value={scopes}
          onChange={setScopes}
          disabled={busy}
        />
        {scopes.includes("sources:read") && (
          <ReferenceOrigins
            value={origins}
            onChange={setOrigins}
            disabled={busy}
          />
        )}
        <button
          className="button button-accent"
          disabled={busy || !!issued || !scopes.length}
        >
          {busy ? "Working…" : "Create OAuth connection"}
        </button>
      </form>
      {issued && (
        <OAuthIssuedDetails
          issued={issued}
          platform={platform}
          onDone={() => setIssued(undefined)}
        />
      )}
      <h3>Your OAuth connections</h3>
      <p className="small muted">
        Existing connections keep their original allowed actions. To add
        actions, create a new connection with those permissions and reconnect
        your AI app.
      </p>
      {error ? (
        <button className="button button-outline" onClick={refresh}>
          Reload OAuth connections
        </button>
      ) : !data ? (
        <Loading />
      ) : !data.clients.length ? (
        <p>No OAuth connections yet.</p>
      ) : (
        <ul className="automation-connections">
          {data.clients.map((client) => (
            <li key={client.clientId}>
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <h4>{client.name ?? "OAuth connection"}</h4>
                <p>{client.disabled ? "Revoked" : "Available for consent"}</p>
                <p className="small muted">{client.redirectUris.join(" · ")}</p>
                <details>
                  <summary>{client.scopes.length} allowed actions</summary>
                  <p>
                    {client.scopes
                      .map(
                        (scope) =>
                          scopeDefinitions[scope as AutomationScope]?.label ??
                          scope,
                      )
                      .join(" · ")}
                  </p>
                  {client.sourceOrigins.length > 0 && (
                    <p>{client.sourceOrigins.join(", ")}</p>
                  )}
                </details>
              </div>
              {!client.disabled && (
                <button
                  className="button button-outline"
                  disabled={busy}
                  aria-label={`Revoke OAuth ${client.name ?? "connection"}`}
                  onClick={() => void revoke(client)}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
