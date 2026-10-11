const connectionErrors = new Set([
  "invalid_client",
  "client_disabled",
  "invalid_redirect",
  "invalid_scope",
  "invalid_target",
  "unsupported_response_type",
  "unauthorized_client",
]);
const authorizationErrors = new Set([
  ...connectionErrors,
  "invalid_request",
  "login_required",
  "consent_required",
  "access_denied",
  "interaction_required",
  "temporarily_unavailable",
  "server_error",
]);

/** Only unambiguous connection errors classify a legacy generic sign-in URL. */
export function oauthConnectionError(value: unknown): string | undefined {
  return typeof value === "string" && connectionErrors.has(value)
    ? value
    : undefined;
}

/** The OAuth boundary supplies context; never copy arbitrary query/error text. */
export function oauthErrorPath(value: unknown): string {
  const error =
    typeof value === "string" && authorizationErrors.has(value)
      ? value
      : "invalid_request";
  return `/oauth/error?error=${error}`;
}
