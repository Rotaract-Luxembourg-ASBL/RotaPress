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
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to publish albums.");
    return json(
      await services.albums.publish(
        actor,
        (await context.params).id,
        await readMutation(request),
      ),
    );
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to unpublish albums.");
    return json(
      await services.albums.unpublish(
        actor,
        (await context.params).id,
        await readMutation(request),
      ),
    );
  });
}
