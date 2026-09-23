import "server-only";
import { eq } from "drizzle-orm";
import { session } from "../../../db/schema/auth";
import { db } from "../../infrastructure/database/client";
import { googleAuthStore } from "./google_configuration";

/** Only called with a session ID already authenticated by Better Auth. */
export async function currentGoogleSessionVersion(
  sessionId: string,
): Promise<string | null> {
  const [stored] = await db
    .select({ version: session.authProviderVersion })
    .from(session)
    .where(eq(session.id, sessionId));
  return (await googleAuthStore.accepts(stored?.version))
    ? stored!.version
    : null;
}
