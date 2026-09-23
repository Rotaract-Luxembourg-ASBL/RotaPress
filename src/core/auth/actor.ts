import "server-only";
import { auth } from "./server";
import type { TrustedActor } from "@/core/authorization/AuthorizationService";
import { currentGoogleSessionVersion } from "./google_session";

export async function getActor(headers: Headers): Promise<TrustedActor | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  const method = result.session.authMethod;
  const providerVersion =
    method === "google"
      ? await currentGoogleSessionVersion(result.session.id)
      : null;
  if (method === "google" && !providerVersion) return null;
  return {
    userId: result.user.id,
    email: result.user.email,
    emailVerified: result.user.emailVerified,
    sessionId: result.session.id,
    authenticatedAt: new Date(result.session.createdAt),
    authMethod:
      method === "google" || method === "email-otp" ? method : "unknown",
    ...(providerVersion ? { authProviderVersion: providerVersion } : {}),
  };
}
