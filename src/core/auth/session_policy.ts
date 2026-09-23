import "server-only";
import type { TrustedActor } from "../authorization/AuthorizationService";

/** State has already passed Better Auth's cookie/PKCE flow checks; only serverContext is trusted. */
export async function googleFlowIsCurrent(
  snapshotVersion: string | undefined,
  state: { serverContext?: Record<string, unknown> } | null,
  accepts: (version: string) => Promise<boolean>,
): Promise<boolean> {
  const version = state?.serverContext?.googleAuthVersion;
  if (
    !snapshotVersion ||
    typeof version !== "string" ||
    version !== snapshotVersion
  )
    return false;
  return accepts(version);
}

/** The library calls this only after authenticating the provider's response. */
export function validateProviderIdentity(
  user: { emailVerified?: boolean },
  source: { method: string; oauth?: { providerId: string } },
): { error: string; errorDescription: string } | undefined {
  if (source.method !== "oauth") return;
  if (source.oauth?.providerId !== "google" || user.emailVerified !== true) {
    return {
      error: "VERIFIED_GOOGLE_EMAIL_REQUIRED",
      errorDescription:
        "Google must verify this email address before it can be used to sign in.",
    };
  }
}

/** Input is Better Auth's endpoint context, never an incoming JSON field. */
export function sessionAuthenticationMethod(
  context:
    { path?: string; params?: Record<string, unknown> } | null | undefined,
): TrustedActor["authMethod"] {
  if (context?.path === "/sign-in/email-otp") return "email-otp";
  if (context?.path === "/callback/:id" && context.params?.id === "google")
    return "google";
  if (context?.path === "/callback/google") return "google";
  return "unknown";
}
