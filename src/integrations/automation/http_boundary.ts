import { config } from "@/core/config";
import { HttpError } from "@/core/http";

export function withRestChallenge(response: Response): Response {
  if (response.status === 401)
    response.headers.set(
      "WWW-Authenticate",
      'Bearer realm="RotaPress REST API"',
    );
  return response;
}

/** Host and Origin are checked even when handlers are used outside Next's proxy. */
export function requireAutomationOrigin(request: Request) {
  const allowed = new URL(config.APP_URL);
  if (
    request.headers.get("host") &&
    request.headers.get("host") !== allowed.host
  )
    throw new HttpError(403, "Request host is not allowed.");
  const origin = request.headers.get("origin");
  if (origin && origin !== allowed.origin)
    throw new HttpError(403, "Request origin is not allowed.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Cross-site requests are not allowed.");
}
