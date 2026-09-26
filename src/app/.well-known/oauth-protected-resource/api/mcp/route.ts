import {
  automationIssuer,
  automationResource,
  oauthOptions,
} from "@/core/auth/automation_oauth";
export function GET() {
  return Response.json(
    {
      resource: automationResource,
      resource_name: "RotaPress AI & API",
      authorization_servers: [automationIssuer],
      scopes_supported: oauthOptions.scopes,
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
