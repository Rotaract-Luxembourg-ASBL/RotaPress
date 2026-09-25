"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import {
  connectionInput,
  scopeDefinitions,
  type AutomationScope,
} from "../scopes";

const endpoint = "/api/admin/integrations/automation";
type Connection = {
  id: string;
  name: string | null;
  enabled: boolean;
  expiresAt: string | null;
  expired: boolean;
  scopes: AutomationScope[];
  sourceOrigins: string[];
  currentSession: boolean;
};
type IssuedConnection = { id: string; key: string; expiresAt: string };

export function AutomationSettings() {
  const { capabilities, features } = useCurrentUser();
  const allowed = capabilities.includes("integrations.manage");
  const { data, error, refresh } = useResource<{ connections: Connection[] }>(
    allowed ? endpoint : null,
  );
  const [name, setName] = useState("");
  const [origins, setOrigins] = useState("");
  const [expiresIn, setExpiresIn] = useState(3600);
  const [scopes, setScopes] = useState<AutomationScope[]>([
    "website:read",
    "website:write",
  ]);
  const [issued, setIssued] = useState<IssuedConnection>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [problem, setProblem] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const parsed = connectionInput.safeParse({
      name,
      scopes,
      expiresIn,
      sourceOrigins: origins
        .split(/\s+/)
        .filter(Boolean)
        .map((value) => value.replace(/\/$/, "")),
    });
    if (!parsed.success) {
      setProblem(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    if (issued) {
      setProblem(
        "Save or dismiss the current key before creating another connection.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setProblem(undefined);
    setReceipt(undefined);
    try {
      setIssued(
        await request<IssuedConnection>(endpoint, {
          method: "POST",
          body: JSON.stringify(parsed.data),
        }),
      );
      refresh();
      setName("");
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function revoke(connection: Connection) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setProblem(undefined);
    try {
      await request(endpoint, {
        method: "DELETE",
        body: JSON.stringify({ id: connection.id }),
      });
      if (issued?.id === connection.id) setIssued(undefined);
      setReceipt(`Revoked ${connection.name || "connection"}.`);
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.key);
      setReceipt(
        "Key copied. Store it in your AI client's protected credentials.",
      );
    } catch {
      setProblem(
        "Copying is unavailable. Select the key and copy it manually.",
      );
    }
  }
  const available = Object.entries(scopeDefinitions).filter(
    ([scope, definition]) =>
      capabilities.includes(definition.capability) &&
      (!scope.startsWith("forms:") || features.forms) &&
      (!scope.startsWith("events:") || features.events) &&
      (!scope.startsWith("calendar:") || features.calendar),
  );
  return (
    <>
      <PageHeading
        title="AI & API"
        description="Connect an AI assistant to prepare website content and private drafts for your review."
      />
      {!allowed ? (
        <Notice>Your current club role cannot manage connections.</Notice>
      ) : (
        <div className="automation-settings">
          <Notice kind="info">
            Connections use your current staff permissions and stop working when
            you sign out, your session expires or access is removed. Publishing
            stays in the website editor.
          </Notice>
          {(problem || error) && (
            <Notice kind="error">{problem || error}</Notice>
          )}
          {receipt && <Notice kind="success">{receipt}</Notice>}
          <section className="panel" aria-labelledby="automation-create-title">
            <h2 id="automation-create-title">Create a connection</h2>
            <p className="muted">
              Choose only what this assistant needs. Creating a key requires a
              sign-in within the last 15 minutes.
            </p>
            <Link href="/sign-in?next=/admin/integrations/automation">
              Sign in again
            </Link>
            <form onSubmit={create} className="automation-form">
              <label>
                Connection name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Website content assistant"
                  disabled={busy}
                />
              </label>
              <label>
                Expires after
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(Number(e.target.value))}
                  disabled={busy}
                >
                  <option value={1800}>30 minutes</option>
                  <option value={3600}>1 hour</option>
                  <option value={14400}>4 hours</option>
                  <option value={28800}>8 hours</option>
                </select>
              </label>
              <fieldset disabled={busy}>
                <legend>Allowed actions</legend>
                <div className="automation-scopes">
                  {available.map(([scope, definition]) => (
                    <label key={scope} className="automation-scope">
                      <input
                        type="checkbox"
                        checked={scopes.includes(scope as AutomationScope)}
                        onChange={(e) =>
                          setScopes((current) =>
                            e.target.checked
                              ? [...current, scope as AutomationScope]
                              : current.filter((item) => item !== scope),
                          )
                        }
                      />
                      {definition.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                Reference websites
                <textarea
                  value={origins}
                  onChange={(e) => setOrigins(e.target.value)}
                  placeholder="https://www.example.org"
                  rows={3}
                  disabled={busy}
                  aria-describedby="automation-source-help"
                />
              </label>
              <p id="automation-source-help" className="muted">
                Up to five HTTPS website origins, one per line. Include the
                exact hostname, including www when used. Enable “Read approved
                reference websites” to let the assistant fetch content.
              </p>
              <button
                className="button button-accent"
                disabled={busy || !!issued || scopes.length === 0}
              >
                {busy ? "Working…" : "Create connection"}
              </button>
            </form>
          </section>
          {issued && (
            <section className="panel" aria-labelledby="automation-key-title">
              <h2 id="automation-key-title">Save your key</h2>
              <p>
                This key is shown once. Add it to your AI client's protected
                credentials; keep it out of prompts, repositories and shared
                documents.
              </p>
              <label>
                Connection key
                <input
                  type="password"
                  value={issued.key}
                  readOnly
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <p>Expires {new Date(issued.expiresAt).toLocaleString()}.</p>
              <div className="actions">
                <button className="button button-accent" onClick={copy}>
                  Copy key
                </button>
                <button
                  className="button button-outline"
                  onClick={() => setIssued(undefined)}
                >
                  I saved the key
                </button>
              </div>
            </section>
          )}
          <section className="panel" aria-labelledby="automation-connect-title">
            <h2 id="automation-connect-title">Connect and prepare content</h2>
            <p>
              <Link href="/admin/integrations/automation/docs">
                API documentation & tester
              </Link>{" "}
              includes the operation reference, REST/MCP tests and Claude/OpenAI
              connection examples.
            </p>
            <ol>
              <li>
                Connect your MCP client to <code>/api/mcp</code> on this website
                with the key in its Authorization header. Clients must support
                custom bearer credentials; OAuth-only connectors are not
                supported.
              </li>
              <li>
                For a local client using standard input/output, run{" "}
                <code>node scripts/mcp_bridge.mjs</code> from the repository,
                with <code>ROTAPRESS_MCP_URL</code> and{" "}
                <code>ROTAPRESS_API_KEY</code> in its protected environment.
              </li>
              <li>
                Choose the <code>adapt_reference_website</code> prompt, give
                your reference URL and explain which content and pages you want.
              </li>
              <li>
                Open the draft links returned by the assistant. Review facts,
                sources, links and layouts before publishing manually.
              </li>
            </ol>
            <p className="muted">
              REST clients can discover their actions at{" "}
              <code>/api/v1/capabilities</code> and the API contract at{" "}
              <code>/api/v1/openapi.json</code>, using the same key.
            </p>
            <Link href="/admin/website">Review website drafts</Link>
          </section>
          <section
            className="panel"
            aria-labelledby="automation-connections-title"
          >
            <h2 id="automation-connections-title">Your connections</h2>
            {!data ? (
              <Loading />
            ) : data.connections.length === 0 ? (
              <p>No connections yet. Create one above to get started.</p>
            ) : (
              <ul className="automation-connections">
                {data.connections.map((connection) => (
                  <li key={connection.id}>
                    <div>
                      <h3>{connection.name || "Connection"}</h3>
                      <p>
                        {connection.expired
                          ? "Expired"
                          : connection.enabled
                            ? "Enabled"
                            : "Disabled"}{" "}
                        ·{" "}
                        {connection.expiresAt
                          ? `Expires ${new Date(connection.expiresAt).toLocaleString()}`
                          : "No expiry"}
                      </p>
                      <p className="muted">
                        {connection.scopes
                          .map((scope) => scopeDefinitions[scope].label)
                          .join(" · ")}
                      </p>
                      {connection.sourceOrigins.length > 0 && (
                        <p>{connection.sourceOrigins.join(", ")}</p>
                      )}
                    </div>
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => revoke(connection)}
                      aria-label={`Revoke ${connection.name || "connection"}`}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="button button-outline"
              onClick={refresh}
              disabled={busy}
            >
              Refresh connections
            </button>
          </section>
        </div>
      )}
    </>
  );
}
