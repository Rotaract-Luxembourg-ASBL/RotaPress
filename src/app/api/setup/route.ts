import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readMutation(request);
    await services.limiter.consume("setup", "installation", 10);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in before completing setup.");
    return json(await services.installation.complete(actor, body), 201);
  });
}
