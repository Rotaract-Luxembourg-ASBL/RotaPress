import { getActor } from "@/core/auth/actor";
import { oauthConnections } from "@/composition/automation";
import { handle, HttpError, json, readMutation } from "@/core/http";

export function POST(request: Request) {
  return handle(async () => {
    const input = await readMutation(request, 8192);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to review this connection.");
    return json(
      await oauthConnections.reviewPermissions(actor, request.headers, input),
    );
  });
}
