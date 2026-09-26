"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import {
  connectionInput,
  scopeDefinitions,
  type AutomationScope,
} from "../scopes";
import type { AutomationTransport } from "../availability_schemas";
import { ScopePicker } from "./scope-picker";
import { ReferenceOrigins } from "./reference-origins";

const endpoint = "/api/admin/integrations/automation";
type Connection = {
  id: string;
  name: string | null;
  enabled: boolean;
  expiresAt: string | null;
  expired: boolean;
  scopes: AutomationScope[];
  sourceOrigins: string[];
};
type IssuedConnection = { id: string; key: string; expiresAt: string };

export function TokenSettings({
  transport,
  onTest,
}: {
  transport: AutomationTransport;
  onTest: (key: string) => void;
}) {
  const rest = transport === "rest";
  const credential = rest ? "API token" : "MCP access key";
  const { data, error, refresh } = useResource<{ connections: Connection[] }>(
    `${endpoint}?transport=${transport}`,
  );
  const [name, setName] = useState("");
  const [origins, setOrigins] = useState("");
  const [expiresIn, setExpiresIn] = useState(3600);
  const [scopes, setScopes] = useState<AutomationScope[]>(["website:read"]);
  const [issued, setIssued] = useState<IssuedConnection>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [problem, setProblem] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || issued) return;
    const parsed = connectionInput.safeParse({
      transport,
      name,
      scopes,
      expiresIn,
      sourceOrigins: scopes.includes("sources:read")
        ? origins
            .split(/\s+/)
            .filter(Boolean)
            .map((value) => value.replace(/\/$/, ""))
        : [],
    });
    if (!parsed.success) {
      setProblem(parsed.error.issues.map((issue) => issue.message).join(" "));
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
      setReceipt(`Revoked ${connection.name || credential}.`);
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
        `${rest ? "Token" : "Key"} copied. Store it in your client's protected credentials.`,
      );
    } catch {
      setProblem(
        "Copying is unavailable. Select the credential and copy it manually.",
      );
    }
  }
  return (
    <div className="automation-settings">
      <section
        className="panel"
        aria-label={rest ? "API tokens" : "MCP access keys"}
      >
        <h2>{rest ? "Create an API token" : "Create an MCP access key"}</h2>
        <p>
          {rest
            ? "Give a script or application access to selected REST endpoints."
            : "For clients that support a bearer credential or the local stdio bridge."}
        </p>
        <p className="small muted">
          Credentials expire within eight hours and stop when the staff session
          ends. Creating one requires a sign-in within the last 15 minutes.
        </p>
        <Link href={`/sign-in?reauth=1&next=/admin/integrations/${transport}`}>
          Sign in again
        </Link>
        {problem && <Notice>{problem}</Notice>}
        {receipt && <Notice kind="success">{receipt}</Notice>}
        {issued ? (
          <div
            className="credential-issued form-stack"
            aria-labelledby="credential-issued-title"
          >
            <h3 id="credential-issued-title">
              {rest ? "Save your API token" : "Save your MCP access key"}
            </h3>
            <p>
              Shown once. Store it in protected client settings, outside prompts
              and shared documents.
            </p>
            <label>
              {rest ? "New API token" : "New MCP access key"}
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
                Copy {rest ? "token" : "key"}
              </button>
              <button
                className="button button-outline"
                onClick={() => onTest(issued.key)}
              >
                Use in {rest ? "live tester" : "connection test"}
              </button>
              <button
                className="button button-outline"
                onClick={() => setIssued(undefined)}
              >
                I saved the {rest ? "token" : "key"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={create} className="automation-form">
            <div className="credential-fields">
              <label>
                {rest ? "Token name" : "MCP key name"}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder={
                    rest ? "Website import script" : "Local content assistant"
                  }
                  disabled={busy}
                />
              </label>
              <label>
                Expires after
                <select
                  value={expiresIn}
                  onChange={(event) => setExpiresIn(Number(event.target.value))}
                  disabled={busy}
                >
                  <option value={1800}>30 minutes</option>
                  <option value={3600}>1 hour</option>
                  <option value={14400}>4 hours</option>
                  <option value={28800}>8 hours</option>
                </select>
              </label>
            </div>
            <ScopePicker value={scopes} onChange={setScopes} disabled={busy} />
            {scopes.includes("sources:read") && (
              <ReferenceOrigins
                value={origins}
                onChange={setOrigins}
                disabled={busy}
              />
            )}
            <div className="actions">
              <button
                className="button button-accent"
                disabled={busy || scopes.length === 0}
              >
                {busy
                  ? "Creating…"
                  : rest
                    ? "Generate API token"
                    : "Generate MCP access key"}
              </button>
            </div>
          </form>
        )}
      </section>
      <section
        className="panel"
        aria-label={rest ? "Your API tokens" : "Your MCP access keys"}
      >
        <h2>{rest ? "Your API tokens" : "Your MCP access keys"}</h2>
        <p className="small muted">
          Issued by your account. Revocation stops future requests; create a new
          credential to reconnect.
        </p>
        {error ? (
          <Notice>{error}</Notice>
        ) : !data ? (
          <Loading />
        ) : !data.connections.length ? (
          <p>
            {rest
              ? "No API tokens yet. Generate one above to start using REST."
              : "No MCP access keys yet. OAuth clients do not need an access key."}
          </p>
        ) : (
          <ul className="automation-connections">
            {data.connections.map((connection) => (
              <li key={connection.id}>
                <div>
                  <h3>{connection.name || credential}</h3>
                  <p>
                    {connection.expired
                      ? "Expired"
                      : connection.enabled
                        ? "Issued · session required"
                        : "Disabled"}
                    {connection.expiresAt &&
                      ` · Expires ${new Date(connection.expiresAt).toLocaleString()}`}
                  </p>
                  <details>
                    <summary>
                      {connection.scopes.length} allowed actions
                    </summary>
                    <ul>
                      {connection.scopes.map((scope) => (
                        <li key={scope}>{scopeDefinitions[scope].label}</li>
                      ))}
                    </ul>
                    {connection.sourceOrigins.length > 0 && (
                      <p>{connection.sourceOrigins.join(", ")}</p>
                    )}
                  </details>
                </div>
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => void revoke(connection)}
                  aria-label={`Revoke ${connection.name || credential}`}
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
          Refresh {rest ? "tokens" : "keys"}
        </button>
      </section>
    </div>
  );
}
