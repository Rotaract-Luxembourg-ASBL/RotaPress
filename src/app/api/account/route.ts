import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to view your account.");
    return json(await services.account.workspace(actor));
  });
}
export async function PATCH(request: Request) {
  return handle(async () => {
    const input = await readMutation(request, 8192);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to update your profile.");
    return json(await services.account.save(actor, input));
  });
}
