import "server-only";
import { z } from "zod";
import { authenticationHandler, auth } from "@/core/auth/server";
import { authenticationAddress } from "@/core/auth/request_address";
import { config } from "@/core/config";
import { readBoundedBody } from "@/core/http";
import { services } from "@/composition/services";
import { oauthAccess, automationAvailability } from "@/composition/automation";
import { automationResource } from "@/core/auth/automation_oauth";

const tokenInput = z.strictObject({
  grant_type: z.enum(["authorization_code", "refresh_token"]),
  client_id: z.string().min(1).max(200).optional(),
  client_secret: z.string().min(1).max(300).optional(),
  code: z.string().min(1).max(500).optional(),
  code_verifier: z
    .string()
    .regex(/^[A-Za-z0-9._~-]{43,128}$/)
    .optional(),
  redirect_uri: z.url().max(1000).optional(),
  refresh_token: z.string().min(1).max(300).optional(),
  resource: z.literal(automationResource).optional(),
  scope: z.string().max(2000).optional(),
});
const revokeInput = z.strictObject({
  token: z.string().min(1).max(500),
  token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
  client_id: z.string().min(1).max(200).optional(),
  client_secret: z.string().min(1).max(300).optional(),
});

function problem(error = "invalid_request", status = 400) {
  return Response.json(
    {
      error,
      error_description:
        "The OAuth request is invalid or no longer authorized. Start the connection again.",
    },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

/** Only protocol endpoints are forwarded. Management/consent stay behind our staff boundary. */
export async function oauthProtocolRequest(
  request: Request,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/auth/, "");
    if (path === "/oauth2/authorize" || path === "/oauth2/token")
      await automationAvailability.requireEnabled("mcp");
    if (
      request.headers.get("host") &&
      request.headers.get("host") !== new URL(config.APP_URL).host
    )
      return problem("invalid_request", 403);
    const headers = new Headers(request.headers);
    const address = authenticationAddress(headers, config.ROTAPRESS_PROXY);
    headers.set("x-real-ip", address);
    headers.set("x-forwarded-for", address);
    await services.limiter.consume("oauth-protocol", address, 120);
    let forwarded: Request;
    if (path === "/oauth2/authorize" && request.method === "GET") {
      const params = url.searchParams;
      if (
        url.search.length > 6000 ||
        [...params.keys()].some((key) => params.getAll(key).length !== 1) ||
        params.getAll("resource").length !== 1 ||
        params.get("resource") !== automationResource ||
        params.get("response_type") !== "code" ||
        params.get("code_challenge_method") !== "S256" ||
        !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge") ?? "") ||
        !params.get("state") ||
        (params.has("scope") && !params.get("scope")?.trim())
      )
        return problem();
      // An omitted scope uses Better Auth's registered client defaults. Never
      // replace an explicitly requested subset with more allowed actions.
      // Offer renewal even for clients that request only an application action.
      // It remains visible and optional on consent; no application action is added.
      if (params.has("scope")) {
        const scopes = params.get("scope")!.split(/\s+/).filter(Boolean);
        if (!scopes.includes("offline_access")) scopes.push("offline_access");
        params.set("scope", scopes.join(" "));
      }
      // Better Auth remembers matching scope/resource consent. Honor an explicit
      // client prompt, including consent/login/none, rather than forcing a review.
      forwarded = new Request(url, { headers });
    } else if (
      ["/oauth2/token", "/oauth2/revoke"].includes(path) &&
      request.method === "POST"
    ) {
      const type = headers.get("content-type")?.split(";")[0];
      const text = (await readBoundedBody(request, 16384)).toString("utf8");
      let input: unknown;
      if (type === "application/x-www-form-urlencoded") {
        const params = new URLSearchParams(text);
        if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
          return problem();
        input = Object.fromEntries(params);
      } else if (type === "application/json") input = JSON.parse(text);
      else return problem("invalid_request", 415);
      const parsed =
        path === "/oauth2/token"
          ? tokenInput.parse(input)
          : revokeInput.parse(input);
      if ("grant_type" in parsed && !parsed.resource) {
        if (parsed.grant_type !== "refresh_token") return problem();
        // This server has exactly one MCP resource. The provider also checks
        // the stored refresh grant and client-resource registration.
        parsed.resource = automationResource;
      }
      headers.delete("cookie");
      headers.delete("content-length");
      headers.set("content-type", "application/x-www-form-urlencoded");
      forwarded = new Request(url, {
        method: "POST",
        headers,
        body: new URLSearchParams(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ).toString(),
      });
    } else return problem("unsupported_operation", 404);
    const response = await authenticationHandler(forwarded);
    if (path === "/oauth2/token" && response.ok) {
      const result = z
        .object({ access_token: z.string() })
        .safeParse(await response.clone().json());
      if (!result.success) return problem("invalid_grant");
      // A valid OAuth exchange cannot escape current club/session policy, including refresh.
      await oauthAccess.authenticate(result.data.access_token, false);
    }
    const resultHeaders = new Headers(response.headers);
    resultHeaders.set("Cache-Control", "no-store, private");
    resultHeaders.set("Pragma", "no-cache");
    return new Response(response.body, {
      status: response.status,
      headers: resultHeaders,
    });
  } catch (error) {
    const limited =
      error instanceof Error && "status" in error && error.status === 429;
    const disabled =
      error instanceof Error && "status" in error && error.status === 409;
    return problem(
      limited || disabled ? "temporarily_unavailable" : "invalid_request",
      limited ? 429 : disabled ? 409 : 400,
    );
  }
}

export async function oauthServerMetadata() {
  const document = await auth.api.getOAuthServerConfig();
  return Response.json(document, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
