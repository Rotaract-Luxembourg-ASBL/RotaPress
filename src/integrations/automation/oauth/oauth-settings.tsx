"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { scopeDefinitions, type AutomationScope } from "../scopes";
import { ScopePicker } from "../ui/scope-picker";
import { ReferenceOrigins } from "../ui/reference-origins";

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
type Issued = { clientId: string; clientSecret?: string; resource: string };

export function OAuthSettings() {
  const { data, error, refresh } = useResource<{ clients: OAuthClient[] }>(
    endpoint,
  );
  const [name, setName] = useState("");
  const [redirects, setRedirects] = useState("");
  const [origins, setOrigins] = useState("");
  const [authentication, setAuthentication] = useState("client_secret_post");
  const [scopes, setScopes] = useState<AutomationScope[]>(["website:read"]);
  const [issued, setIssued] = useState<Issued>();
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
        await request<Issued>(endpoint, {
          method: "POST",
          body: JSON.stringify({
            name,
            redirectUris: redirects.split(/\s+/).filter(Boolean),
            authentication,
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
  async function copySecret() {
    try {
      if (issued?.clientSecret)
        await navigator.clipboard.writeText(issued.clientSecret);
      setReceipt(
        "Client secret copied. Store it only in your AI client's protected connection settings.",
      );
    } catch {
      setProblem(
        "Copying is unavailable. Select the client secret and copy it manually.",
      );
    }
  }
  return (
    <section className="panel" aria-labelledby="oauth-settings-title">
      <h2 id="oauth-settings-title">Connect with OAuth</h2>
      <p>
        In your assistant's MCP settings, add this server and choose OAuth. Copy
        its callback URL below, register the connection, then return to the
        assistant with your client ID and secret. It opens RotaPress for sign-in
        and consent.
      </p>
      <p className="muted">
        Creating a client requires a sign-in within the last 15 minutes. The
        connection can use only your current staff permissions. Registration
        prepares the client; access begins after you approve its consent screen.
      </p>
      <Link href="/sign-in?reauth=1&next=/admin/integrations/mcp">
        Sign in again
      </Link>
      {(problem || error) && <Notice>{problem || error}</Notice>}
      {receipt && <Notice kind="success">{receipt}</Notice>}
      <form className="automation-form" onSubmit={create} hidden={!!issued}>
        <label>
          OAuth connection name
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            placeholder="ChatGPT club assistant"
          />
        </label>
        <label>
          OAuth callback URLs
          <textarea
            required
            rows={3}
            value={redirects}
            onChange={(event) => setRedirects(event.target.value)}
            disabled={busy}
            placeholder="Copy the exact callback URL from your AI client's settings"
          />
        </label>
        <p className="small muted">
          One exact HTTPS callback per line, up to three. Wildcards are
          unsupported. Local installations also accept loopback HTTP callbacks
          for testing.
        </p>
        <label>
          OAuth client authentication
          <select
            value={authentication}
            onChange={(event) => setAuthentication(event.target.value)}
            disabled={busy}
          >
            <option value="client_secret_post">Client ID and secret</option>
            <option value="none">Public client with PKCE</option>
          </select>
        </label>
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
        <div className="panel" aria-labelledby="oauth-issued-title">
          <h3 id="oauth-issued-title">Save your OAuth client details</h3>
          <label>
            OAuth client ID
            <input readOnly value={issued.clientId} />
          </label>
          <label>
            MCP server URL
            <input readOnly value={issued.resource} />
          </label>
          {issued.clientSecret && (
            <>
              <p>
                This client secret is shown once. Keep it out of prompts and
                shared documents.
              </p>
              <label>
                OAuth client secret
                <input
                  type="password"
                  autoComplete="off"
                  readOnly
                  value={issued.clientSecret}
                />
              </label>
              <button className="button button-outline" onClick={copySecret}>
                Copy client secret
              </button>
            </>
          )}
          <button
            className="button button-outline"
            onClick={() => setIssued(undefined)}
          >
            I saved the OAuth details
          </button>
        </div>
      )}
      <h3>Your OAuth connections</h3>
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
