import "server-only";
import { auth } from "./server";
import type { TrustedActor } from "@/core/authorization/AuthorizationService";
import { currentGoogleSessionVersion } from "./google_session";
import { signInPolicy } from "./sign_in_policy";
import { config } from "@/core/config";
import { sessionContextChanged } from "./request_address";

export async function getActor(headers: Headers): Promise<TrustedActor | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  const method = result.session.authMethod;
  if (!(await signInPolicy.acceptsSession(method))) return null;
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
    sessionContextChanged: sessionContextChanged(
      result.session,
      headers,
      config.ROTAPRESS_PROXY,
    ),
    authMethod:
      method === "google" || method === "email-otp" ? method : "unknown",
    ...(providerVersion ? { authProviderVersion: providerVersion } : {}),
  };
}
