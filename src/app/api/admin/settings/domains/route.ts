import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to continue.");
    return json(await services.domains.workspace(actor));
  });
}
async function mutate(request: Request, operation: "add" | "change") {
  return handle(async () => {
    const input = await readMutation(request, 2048);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to continue.");
    return json(await services.domains[operation](actor, input));
  });
}
export const POST = (request: Request) => mutate(request, "add");
export const PATCH = (request: Request) => mutate(request, "change");
