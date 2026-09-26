import { getActor } from "@/core/auth/actor";
import { oauthConnections } from "@/composition/automation";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { pendingOAuthCookie } from "@/integrations/automation/oauth/pending";
import { cookies } from "next/headers";

export function POST(request: Request) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to review this connection.");
    const result = await oauthConnections.consent(
      actor,
      request.headers,
      await readMutation(request, 8192),
    );
    (await cookies()).delete(pendingOAuthCookie);
    return json(result);
  });
}
