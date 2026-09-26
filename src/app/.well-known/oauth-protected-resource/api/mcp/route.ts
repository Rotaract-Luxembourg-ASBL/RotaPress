import {
  automationIssuer,
  automationResource,
} from "@/core/auth/automation_oauth";
export function GET() {
  return Response.json(
    {
      resource: automationResource,
      resource_name: "RotaPress AI & API",
      authorization_servers: [automationIssuer],
      // Actions vary by registered client. The authorization server documents
      // supported scopes and defaults omitted scope to that client's selection.
      bearer_methods_supported: ["header"],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
