import "server-only";
import { config } from "@/core/config";

/** Public discovery reveals no client registrations, credentials or staff data. */
export function withOAuthChallenge(response: Response): Response {
  if (response.status === 401) {
    response.headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/mcp", config.APP_URL).href}", scope="website:read"`,
    );
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}
