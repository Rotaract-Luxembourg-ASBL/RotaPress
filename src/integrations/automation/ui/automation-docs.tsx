"use client";
import { useState } from "react";
import type { operationCatalogue } from "../catalogue";
import type { AutomationTransport } from "../availability_schemas";
import { scopeDefinitions } from "../scopes";
import {
  runTester,
  testMcpConnection,
  testerFetch,
  restRequest,
  type TesterResult,
} from "./tester_request";

type Entry = ReturnType<typeof operationCatalogue>[number];
export function AutomationDocs({
  operations,
  version,
  origin,
  transport,
  credential,
  onCredentialChange,
  enabled,
  onConnect,
}: {
  operations: Entry[];
  version: string;
  origin: string;
  transport: AutomationTransport;
  credential: string;
  onCredentialChange: (key: string) => void;
  enabled: boolean;
  onConnect: () => void;
}) {
  const rest = transport === "rest";
  const [selected, setSelected] = useState("automation_capabilities");
  const [input, setInput] = useState("{}");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TesterResult | null>(null);
  const current = operations.find((entry) => entry.name === selected)!;
  const filtered = operations.filter((entry) =>
    `${entry.name} ${entry.description} ${rest ? entry.path : ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function choose(name: string) {
    const operation = operations.find((entry) => entry.name === name)!;
    const example = { ...operation.example };
    if ("requestId" in example) example.requestId = crypto.randomUUID();
    setSelected(name);
    setInput(JSON.stringify(example, null, 2));
    setResult(null);
    setError("");
  }
  async function execute(action: () => Promise<TesterResult>) {
    if (busy) return;
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
      const response = await testerFetch(
        credential,
        "/api/v1/openapi.json",
        "GET",
      );
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
  let example = "Complete the request input to see an example.";
  try {
    if (rest) {
      const request = restRequest(current, input);
      preview = `${request.method} ${request.path}`;
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      example = `curl --request ${request.method} ${quote(origin + request.path)} \\\n  --header "Authorization: Bearer $ROTAPRESS_REST_TOKEN"${request.body ? ` \\\n  --header 'Content-Type: application/json' \\\n  --data ${quote(request.body)}` : ""}`;
    } else {
      preview = `tools/call · ${current.name}`;
      example = JSON.stringify(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: current.name,
            arguments: JSON.parse(input) as unknown,
          },
        },
        null,
        2,
      );
    }
  } catch {
    /* Show input errors only on deliberate send; retain entered work. */
  }
  const groups = [
    ...new Set(
      operations.map((entry) => entry.scope?.split(":")[0] ?? "discovery"),
    ),
  ];
  return (
    <div className="automation-docs">
      <section className="panel">
        <h2>
          {rest
            ? "REST API documentation & live tester"
            : "MCP tools & connection test"}
        </h2>
        <p>
          {rest
            ? "Generate an API token, choose an endpoint, then send a request. Start with capabilities to see your granted actions."
            : "Inspect the available tools and their schemas. Test an MCP access key or an OAuth access token after connecting your client."}{" "}
          Contract {version}.
        </p>
        <p className="small muted">
          {rest
            ? "Send Authorization: Bearer <API token>. Responses wrap results in data and failures in error. Cookies do not authorize requests."
            : "This server uses stateless Streamable HTTP. The connection test initializes MCP and lists tools, resources and prompts without saving content."}
        </p>
      </section>
      <div className="automation-docs-layout">
        <section
          className="panel automation-reference"
          aria-labelledby="automation-operation-title"
        >
          <h2 id="automation-operation-title">
            {rest ? "Endpoint reference" : "Tool reference"}
          </h2>
          <label>
            Search {rest ? "endpoints" : "tools"}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="e.g. website, media, events"
              disabled={busy}
            />
          </label>
          <label>
            {rest ? "Endpoint" : "MCP tool"}
            <select
              value={selected}
              onChange={(event) => choose(event.target.value)}
              disabled={busy}
            >
              {!filtered.some((entry) => entry.name === selected) && (
                <option value={current.name}>
                  {current.name} · current selection
                </option>
              )}
              {groups.map((group) => {
                const entries = filtered.filter(
                  (entry) =>
                    (entry.scope?.split(":")[0] ?? "discovery") === group,
                );
                return (
                  entries.length > 0 && (
                    <optgroup key={group} label={group}>
                      {entries.map((entry) => (
                        <option key={entry.name} value={entry.name}>
                          {rest ? `${entry.method} ${entry.path}` : entry.name}
                        </option>
                      ))}
                    </optgroup>
                  )
                );
              })}
            </select>
          </label>
          {!filtered.length && (
            <p>
              No matches. Clear the search to browse all{" "}
              {rest ? "endpoints" : "tools"}.
            </p>
          )}
          <p>{current.description}</p>
          <dl>
            <dt>{rest ? "Endpoint" : "Tool name"}</dt>
            <dd>
              <code>
                {rest ? `${current.method} ${current.path}` : current.name}
              </code>
            </dd>
            <dt>Required permission</dt>
            <dd>
              {current.scope ? (
                <>
                  {scopeDefinitions[current.scope].label}{" "}
                  <code>({current.scope})</code>
                </>
              ) : (
                "Any current credential for this integration"
              )}
            </dd>
            <dt>Effect</dt>
            <dd>
              {current.readOnly
                ? "Reads content or returns instructions."
                : current.scope?.endsWith(":publish")
                  ? "Publishes the saved content to its configured audience. Confirm the exact target and version before sending."
                  : "Saves private content or a settings proposal. Publishing needs a separate permission and explicit request."}
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
            <summary>
              {rest ? "cURL example (bash)" : "MCP request example"}
            </summary>
            {rest && (
              <p>
                Set ROTAPRESS_REST_TOKEN in your protected shell environment.
                This example never includes your pasted token.
              </p>
            )}
            <pre>{example}</pre>
          </details>
          <details>
            <summary>Errors, limits and retries</summary>
            <ul>
              <li>
                401: use a credential for this integration. Reconnect after
                expiry, sign-out or revocation.
              </li>
              <li>
                403: check allowed actions, current membership and approved
                source origins.
              </li>
              <li>
                409: enable this integration or reread a changed revision. Keep
                an import retry's request ID and body identical.
              </li>
              <li>
                400/415/422: correct the input, content type or rejected
                content. 413: keep JSON below 256 KiB.
              </li>
              <li>
                429: wait at least 60 seconds. Limits are 120 requests per
                connection/minute and 20 source reads per connection/minute.
              </li>
              <li>
                Lists accept offset and limit (maximum 50). Follow nextOffset
                until null.
              </li>
              <li>
                Imports, image uploads, event preparation and settings proposals
                support stable request IDs. Reuse the exact payload for retries;
                other create requests can create duplicates.
              </li>
            </ul>
          </details>
          {rest && (
            <details>
              <summary>Binary image upload</summary>
              <p>
                POST /api/v1/media/upload accepts up to 5 MiB of PNG, JPEG or
                WebP bytes, with a media:write token. Set Content-Type to the
                image type and X-RotaPress-Upload to base64url JSON containing
                requestId and filename, with optional title, alt, caption, tags
                and collection. Images remain private. The downloadable OpenAPI
                includes this endpoint and its metadata schema.
              </p>
            </details>
          )}
        </section>
        <section
          className="panel automation-tester"
          aria-labelledby="automation-tester-title"
        >
          <h2 id="automation-tester-title">
            {rest ? "Try a request" : "Test an MCP tool"}
          </h2>
          <p>
            Requests run against this club. Writes are real saves. Credentials
            stay in page memory until cleared or reloaded.
          </p>
          <label>
            {rest ? "REST API token" : "MCP access key or OAuth access token"}
            <input
              type="password"
              value={credential}
              onChange={(event) => onCredentialChange(event.target.value)}
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
                onCredentialChange("");
                setResult(null);
                setError("");
              }}
            >
              Clear credential and response
            </button>
            <button
              className="inline-button"
              disabled={busy}
              onClick={onConnect}
            >
              {rest ? "Create an API token" : "Manage MCP connections"}
            </button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void execute(() =>
                runTester(credential, transport, current, input),
              );
            }}
          >
            <label>
              Request input (JSON)
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={12}
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <p className="small muted">
              {rest
                ? "Include path IDs in the input; the tester moves them into the URL. "
                : ""}
              Replace example IDs and facts before writing. Selecting another{" "}
              {rest ? "endpoint" : "tool"} loads its example.
            </p>
            <p>
              <code>{preview}</code>
            </p>
            <div className="actions">
              <button
                className="button button-accent"
                disabled={busy || !credential || !enabled}
              >
                {busy
                  ? "Sending…"
                  : current.readOnly
                    ? "Send read request"
                    : "Send write request"}
              </button>
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={() => choose(selected)}
              >
                Reset example
              </button>
            </div>
          </form>
          {!credential && (
            <p className="small muted">
              {rest
                ? "Paste an API token or generate one in API tokens to send your first request."
                : "Paste an MCP credential to run a connection check or tool."}
            </p>
          )}
          {!enabled && (
            <p className="small muted">
              Enable {rest ? "REST API" : "MCP"} in Integrations before sending
              requests.
            </p>
          )}
          <div className="automation-docs-actions">
            {rest ? (
              <button
                className="button button-outline"
                disabled={busy || !credential || !enabled}
                onClick={() => void downloadSpec()}
              >
                Download OpenAPI
              </button>
            ) : (
              <button
                className="button button-outline"
                disabled={busy || !credential || !enabled}
                onClick={() =>
                  void execute(() => testMcpConnection(credential))
                }
              >
                Test MCP connection
              </button>
            )}
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
    </div>
  );
}
