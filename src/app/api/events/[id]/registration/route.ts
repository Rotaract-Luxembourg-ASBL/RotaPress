import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import {
  handle,
  HttpError,
  json,
  readMutation,
  requireMutationOrigin,
} from "@/core/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handle(async () =>
    json(
      await services.registrations.publicForm(
        await getActor(request.headers),
        (await context.params).id,
      ),
    ),
  );
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    requireMutationOrigin(request);
    await services.limiter.consume("form-submit-global", "local", 120);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to register.");
    await services.limiter.consume("form-submit-actor", actor.userId, 30);
    const result = await services.registrations.register(
      actor,
      (await context.params).id,
      await readMutation(request, 64 * 1024),
    );
    return json(result, result.duplicate ? 200 : 201);
  });
}
