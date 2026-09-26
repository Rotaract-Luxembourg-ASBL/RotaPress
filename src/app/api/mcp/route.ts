import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { automationContext } from "@/composition/automation";
import { handle, HttpError, json, readBoundedBody } from "@/core/http";
import { createMcpServer } from "@/integrations/automation/mcp_server";
import { requireAutomationOrigin } from "@/integrations/automation/http_boundary";
import { withOAuthChallenge } from "@/integrations/automation/oauth/challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return withOAuthChallenge(
    await handle(async () => {
      requireAutomationOrigin(request);
      const context = await automationContext(request, "mcp");
      if (
        request.headers.get("content-type")?.split(";")[0] !==
        "application/json"
      )
        throw new HttpError(415, "Use application/json.");
      let message: unknown;
      const bytes = await readBoundedBody(request, 262144);
      try {
        message = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new HttpError(400, "Use valid MCP JSON.");
      }
      // One message per request prevents legacy JSON-RPC batches bypassing per-key quotas.
      if (!message || typeof message !== "object" || Array.isArray(message))
        throw new HttpError(400, "Send one MCP message per request.");
      const server = createMcpServer(context);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        maxRequestBodySize: 262144,
      });
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(request, {
          parsedBody: message,
        });
        response.headers.set("Cache-Control", "no-store");
        return response;
      } finally {
        await server.close();
      }
    }),
  );
}
function unsupported() {
  const response = json(
    { error: "This stateless MCP endpoint supports POST only." },
    405,
  );
  response.headers.set("Allow", "POST");
  return response;
}
export async function GET(request: Request) {
  return withOAuthChallenge(
    await handle(async () => {
      requireAutomationOrigin(request);
      await automationContext(request, "mcp");
      return unsupported();
    }),
  );
}
export { unsupported as DELETE };
