import "server-only";
import { eq } from "drizzle-orm";
import { session } from "../../../db/schema/auth";
import { db } from "@/infrastructure/database/client";
import { auth } from "./server";
import type { ScheduledIdentity } from "../authorization/AuthorizationService";
import { currentGoogleSessionVersion } from "./google_session";
import { signInPolicy } from "./sign_in_policy";

/** Reload a library-created session; never mint a session or impersonate a user. */
export async function scheduledActor(
  sessionId: string,
  userId: string,
): Promise<ScheduledIdentity | null> {
  const [stored] = await db
    .select({ token: session.token })
    .from(session)
    .where(eq(session.id, sessionId));
  if (!stored) return null;
  const current = await (
    await auth.$context
  ).internalAdapter.findSession(stored.token);
  if (
    !current ||
    current.session.id !== sessionId ||
    current.user.id !== userId ||
    current.session.expiresAt.getTime() <= Date.now()
  )
    return null;
  const method: unknown = current.session.authMethod;
  if (
    typeof method !== "string" ||
    !(await signInPolicy.acceptsSession(method))
  )
    return null;
  const providerVersion =
    method === "google" ? await currentGoogleSessionVersion(sessionId) : null;
  if (method === "google" && !providerVersion) return null;
  return {
    expiresAt: current.session.expiresAt,
    actor: {
      userId: current.user.id,
      email: current.user.email,
      emailVerified: current.user.emailVerified,
      sessionId: current.session.id,
      authenticatedAt: current.session.createdAt,
      authMethod:
        method === "google" || method === "email-otp" ? method : "unknown",
      ...(providerVersion ? { authProviderVersion: providerVersion } : {}),
    },
  };
}
