"use client";
import { useState } from "react";
import Link from "next/link";
import type { operationCatalogue } from "../catalogue";
import {
  runTester,
  testMcpConnection,
  testerFetch,
  restRequest,
  type TesterResult,
} from "./tester_request";
import { ClientInstructions } from "./client-instructions";

type Entry = ReturnType<typeof operationCatalogue>[number];
export function AutomationDocs({
  operations,
  version,
  origin,
}: {
  operations: Entry[];
  version: string;
  origin: string;
}) {
  const [selected, setSelected] = useState("automation_capabilities");
  const [protocol, setProtocol] = useState<"rest" | "mcp">("rest");
  const [input, setInput] = useState("{}");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TesterResult | null>(null);
  const current = operations.find((entry) => entry.name === selected)!;
  function choose(name: string) {
    const operation = operations.find((entry) => entry.name === name)!;
    const example = { ...operation.example };
    if (name === "content_import") example.requestId = crypto.randomUUID();
    setSelected(name);
    setInput(JSON.stringify(example, null, 2));
    setResult(null);
    setError("");
  }
  async function execute(action: () => Promise<TesterResult>) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await action());
    } catch (cause) {
      setError(
        cause instanceof Error &&
          !["TypeError", "TimeoutError", "AbortError"].includes(cause.name)
          ? cause.message
          : "Request failed or timed out. Check the connection. For an import, reuse the same request ID and body before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function downloadSpec() {
    await execute(async () => {
      const response = await testerFetch(key, "/api/v1/openapi.json", "GET");
      if (!response.ok) return response;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(response.body, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "rotapress-openapi.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return {
        ...response,
        body: {
          message:
            "Downloaded rotapress-openapi.json. Import it into your API client.",
        },
      };
    });
  }
  let preview = "Enter valid JSON to preview the request.";
  try {
    const request = restRequest(current, input);
    preview =
      protocol === "rest"
        ? `${request.method} ${request.path}`
        : `POST /api/mcp • tools/call • ${current.name}`;
  } catch {
    /* Field errors are shown on deliberate send; keep entered work. */
  }
  return (
    <div className="automation-docs">
      <header className="page-heading">
        <div>
          <p>
            <Link href="/admin/integrations/automation">
              AI & API connections
            </Link>
          </p>
          <h1>API documentation & tester</h1>
          <p>
            Explore the REST and MCP contract, connect an assistant and test
            your granted actions. Version {version}.
          </p>
        </div>
      </header>
      <div className="automation-docs-layout">
        <section
          className="panel automation-reference"
          aria-labelledby="automation-operation-title"
        >
          <h2 id="automation-operation-title">Operation reference</h2>
          <label>
            Operation
            <select
              aria-label="Operation"
              value={selected}
              onChange={(event) => choose(event.target.value)}
              disabled={busy}
            >
              {operations.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name} · {entry.readOnly ? "Read" : "Save draft"}
                </option>
              ))}
            </select>
          </label>
          <p>{current.description}</p>
          <dl>
            <dt>REST</dt>
            <dd>
              <code>
                {current.method} {current.path}
              </code>
            </dd>
            <dt>MCP tool</dt>
            <dd>
              <code>{current.name}</code>
            </dd>
            <dt>Required permission</dt>
            <dd>
              <code>{current.scope ?? "Any current staff connection"}</code>
            </dd>
            <dt>Effect</dt>
            <dd>
              {current.readOnly
                ? "Reads content or returns instructions."
                : "Creates or updates private drafts in this club. Publication stays manual."}
            </dd>
          </dl>
          <details>
            <summary>Input schema</summary>
            <pre>{JSON.stringify(current.inputSchema, null, 2)}</pre>
          </details>
          <details>
            <summary>Response schema</summary>
            <pre>{JSON.stringify(current.outputSchema, null, 2)}</pre>
          </details>
          <details>
            <summary>Errors, limits and retries</summary>
            <ul>
              <li>
                401: renew an expired or revoked connection. Sign-out also ends
                access.
              </li>
              <li>
                403: check granted actions, membership and approved source
                origins.
              </li>
              <li>
                409: reread changed revisions. Keep an import retry's request ID
                and body identical.
              </li>
              <li>
                400/415/422: correct JSON, content type or rejected content.
                413: reduce the body below 256 KiB.
              </li>
              <li>
                429: wait at least 60 seconds. Limits are 120 requests per
                key/minute and 20 source reads per key/minute.
              </li>
              <li>
                List reads accept offset and limit (maximum 50). Follow
                nextOffset until null.
              </li>
              <li>
                Only content_import is a retry-safe creation operation. Other
                create requests can create duplicates.
              </li>
            </ul>
          </details>
        </section>
        <section
          className="panel automation-tester"
          aria-labelledby="automation-tester-title"
        >
          <h2 id="automation-tester-title">Try a request</h2>
          <p>
            Requests run against this club. Draft writes are real saves. The key
            stays in this page's memory and is cleared when you leave or reload.
          </p>
          <label>
            Tester connection key
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          <div className="automation-docs-actions">
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => {
                setKey("");
                setResult(null);
                setError("");
              }}
            >
              Clear key and response
            </button>
            <Link href="/admin/integrations/automation">
              Create a scoped connection
            </Link>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void execute(() => runTester(key, protocol, current, input));
            }}
          >
            <label>
              Protocol
              <select
                aria-label="Protocol"
                value={protocol}
                onChange={(event) =>
                  setProtocol(event.target.value as "rest" | "mcp")
                }
                disabled={busy}
              >
                <option value="rest">REST API</option>
                <option value="mcp">MCP tools/call</option>
              </select>
            </label>
            <label>
              Request input (JSON)
              <textarea
                aria-label="Request input (JSON)"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={12}
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <p className="muted">
              Inputs include path IDs; the REST tester moves them into the URL.
              Replace example IDs and content before writing. Changing operation
              loads its example.
            </p>
            <p>
              <code>{preview}</code>
            </p>
            <button className="button button-accent" disabled={busy || !key}>
              {busy
                ? "Sending…"
                : current.readOnly
                  ? "Send read request"
                  : "Save private draft"}
            </button>
          </form>
          <div className="automation-docs-actions">
            <button
              className="button button-outline"
              disabled={busy || !key}
              onClick={() => void execute(() => testMcpConnection(key))}
            >
              Test MCP connection
            </button>
            <button
              className="button button-outline"
              disabled={busy || !key}
              onClick={() => void downloadSpec()}
            >
              Download OpenAPI
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {result && (
            <section aria-label="Test response">
              <p role="status">
                {result.ok ? "Request succeeded" : "Request failed"} · HTTP{" "}
                {result.status}
              </p>
              <pre>{JSON.stringify(result.body, null, 2).slice(0, 200000)}</pre>
              {JSON.stringify(result.body).length > 200000 && (
                <p>Response preview limited to 200,000 characters.</p>
              )}
            </section>
          )}
        </section>
      </div>
      <ClientInstructions origin={origin} />
    </div>
  );
}
