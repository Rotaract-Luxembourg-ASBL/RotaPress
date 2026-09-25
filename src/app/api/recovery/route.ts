import { RecoveryService } from "@/core/installation/RecoveryService";
import { db } from "@/infrastructure/database/client";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { requireVerifiedActor } from "@/core/authorization/AuthorizationService";
import { handle, HttpError, json, readMutation } from "@/core/http";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readMutation(request);
    const actor = await getActor(request.headers);
    if (!actor)
      throw new HttpError(
        401,
        "Sign in to the nominated owner identity first.",
      );
    requireVerifiedActor(actor);
    await services.limiter.consume("recovery", actor.userId, 5);
    await new RecoveryService(db).complete(actor, body);
    return json({ recovered: true });
  });
}
