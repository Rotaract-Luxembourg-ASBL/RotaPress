import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to view your registrations.");
    if ((await context.params).path?.length)
      throw new HttpError(404, "Unavailable.");
    return json({ registrations: await services.registrations.mine(actor) });
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const input = await readMutation(request);
    const actor = await getActor(request.headers);
    if (!actor)
      throw new HttpError(401, "Sign in to manage your registrations.");
    await services.limiter.consume("registrations-write", actor.userId, 30);
    const path = (await context.params).path ?? [];
    if (path.length !== 2 || path[1] !== "cancel")
      throw new HttpError(404, "Unavailable.");
    return json(await services.registrations.cancel(actor, path[0], input));
  });
}
