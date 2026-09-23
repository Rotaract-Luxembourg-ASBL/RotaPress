import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to continue.");
    return json(await services.organization.settings(actor));
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const body = await readMutation(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to continue.");
    return json(await services.organization.update(actor, body));
  });
}
