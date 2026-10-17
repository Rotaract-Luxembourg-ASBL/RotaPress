import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import {
  handle,
  HttpError,
  json,
  readMutation,
  requireMutationOrigin,
} from "@/core/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage albums.");
    return json(await services.albums.get(actor, (await context.params).id));
  });
}
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to edit albums.");
    return json(
      await services.albums.save(
        actor,
        (await context.params).id,
        await readMutation(request, 65_536),
      ),
    );
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to delete albums.");
    return json(
      await services.albums.delete(
        actor,
        (await context.params).id,
        await readMutation(request),
      ),
    );
  });
}
