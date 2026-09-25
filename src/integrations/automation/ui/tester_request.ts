export type TesterOperation = {
  name: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
};
export type TesterResult = { status: number; ok: boolean; body: unknown };

function objectInput(raw: string): Record<string, unknown> {
  if (new TextEncoder().encode(raw).length > 262144)
    throw new Error("Keep the request below 256 KiB.");
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error("Enter valid JSON.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Enter a JSON object.");
  return input as Record<string, unknown>;
}
/** Only registered relative paths are used. No arbitrary host, headers or cookie authority. */
export function restRequest(operation: TesterOperation, raw: string) {
  const input = objectInput(raw);
  let path = operation.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = input[name];
    if (typeof value !== "string" || !/^[a-zA-Z0-9-]+$/.test(value))
      throw new Error(`Enter a valid ${name} before sending.`);
    delete input[name];
    return encodeURIComponent(value);
  });
  if (!/^\/api\/v1\/[a-zA-Z0-9_/-]+$/.test(path))
    throw new Error("Choose a registered API operation.");
  if (operation.method === "GET") {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(input)) {
      if (!["string", "number", "boolean"].includes(typeof value))
        throw new Error(`Use a simple query value for ${name}.`);
      query.set(name, String(value));
    }
    if (query.size) path += `?${query}`;
  }
  return {
    path,
    method: operation.method,
    body: operation.method === "GET" ? undefined : JSON.stringify(input),
  };
}
export async function testerFetch(
  key: string,
  path: string,
  method: string,
  body?: string,
): Promise<TesterResult> {
  if (!/^rp_[A-Za-z0-9_-]{20,200}$/.test(key))
    throw new Error("Paste a current RotaPress connection key.");
  if (!(path.startsWith("/api/v1/") || path === "/api/mcp"))
    throw new Error("Choose a RotaPress API endpoint.");
  const response = await fetch(path, {
    method,
    body,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(path === "/api/mcp" ? { "MCP-Protocol-Version": "2025-11-25" } : {}),
    },
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  if (!text) return { status: response.status, ok: response.ok, body: null };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "The server did not return JSON. Check the endpoint and try again.",
    );
  }
  const result =
    value && typeof value === "object" && "result" in value
      ? value.result
      : null;
  const failed =
    value &&
    typeof value === "object" &&
    ("error" in value ||
      (result &&
        typeof result === "object" &&
        "isError" in result &&
        result.isError === true));
  return { status: response.status, ok: response.ok && !failed, body: value };
}
async function mcpRequest(
  key: string,
  method: string,
  params: Record<string, unknown>,
  id?: number,
) {
  return testerFetch(
    key,
    "/api/mcp",
    "POST",
    JSON.stringify({
      jsonrpc: "2.0",
      ...(id !== undefined ? { id } : {}),
      method,
      params,
    }),
  );
}
export async function initializeTesterMcp(key: string) {
  const result = await mcpRequest(
    key,
    "initialize",
    {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "rotapress-api-tester", version: "1.0.0" },
    },
    1,
  );
  if (!result.ok) return result;
  const notification = await mcpRequest(key, "notifications/initialized", {});
  return notification.ok ? result : notification;
}
export async function runTester(
  key: string,
  protocol: "rest" | "mcp",
  operation: TesterOperation,
  raw: string,
) {
  const request = restRequest(operation, raw);
  if (protocol === "rest")
    return testerFetch(key, request.path, request.method, request.body);
  const initialized = await initializeTesterMcp(key);
  if (!initialized.ok) return initialized;
  return mcpRequest(
    key,
    "tools/call",
    { name: operation.name, arguments: objectInput(raw) },
    2,
  );
}
export async function testMcpConnection(key: string) {
  const initialized = await initializeTesterMcp(key);
  if (!initialized.ok) return initialized;
  const tools = await mcpRequest(key, "tools/list", {}, 2);
  if (!tools.ok) return tools;
  const resources = await mcpRequest(key, "resources/list", {}, 3);
  if (!resources.ok) return resources;
  const prompts = await mcpRequest(key, "prompts/list", {}, 4);
  if (!prompts.ok) return prompts;
  return {
    status: 200,
    ok: true,
    body: {
      initialize: initialized.body,
      tools: tools.body,
      resources: resources.body,
      prompts: prompts.body,
    },
  };
}
