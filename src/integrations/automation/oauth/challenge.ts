import "server-only";
import { config } from "@/core/config";

/** Let the authorization server resolve each registered client's default actions. */
export function withOAuthChallenge(response: Response): Response {
  if (response.status === 401) {
    response.headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/mcp", config.APP_URL).href}"`,
    );
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}
