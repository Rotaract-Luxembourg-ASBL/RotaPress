import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Credentials come from the client process environment, never command arguments or stdout.
async function main() {
  const url = new URL(
    process.env.ROTAPRESS_MCP_URL ?? "http://127.0.0.1:3000/api/mcp",
  );
  const key = process.env.ROTAPRESS_API_KEY;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/mcp" ||
    !key?.startsWith("rp_")
  )
    throw new Error(
      "Configure ROTAPRESS_MCP_URL and ROTAPRESS_API_KEY using a protected client environment.",
    );
  const client = new Client({
    name: "rotapress-stdio-bridge",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
    fetch: (input, init) => fetch(input, { ...init, redirect: "error" }),
  });
  await client.connect(transport);
  const server = new Server(
    client.getServerVersion() ?? { name: "rotapress", version: "1.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, ({ params }) =>
    client.listTools(params),
  );
  server.setRequestHandler(CallToolRequestSchema, ({ params }) =>
    client.callTool(params),
  );
  server.setRequestHandler(ListResourcesRequestSchema, ({ params }) =>
    client.listResources(params),
  );
  server.setRequestHandler(ReadResourceRequestSchema, ({ params }) =>
    client.readResource(params),
  );
  server.setRequestHandler(ListPromptsRequestSchema, ({ params }) =>
    client.listPrompts(params),
  );
  server.setRequestHandler(GetPromptRequestSchema, ({ params }) =>
    client.getPrompt(params),
  );
  server.onclose = () => {
    void client.close();
  };
  process.once("SIGINT", () => {
    void server.close();
  });
  process.once("SIGTERM", () => {
    void server.close();
  });
  await server.connect(new StdioServerTransport());
}
main().catch(() => {
  console.error(
    "RotaPress MCP connection failed. Check the endpoint, current staff session, key expiry and granted scopes.",
  );
  process.exitCode = 1;
});
