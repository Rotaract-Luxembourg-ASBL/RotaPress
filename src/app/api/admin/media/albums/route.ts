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
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage albums.");
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
      throw new HttpError(400, "Use each album filter once.");
    return json(await services.albums.list(actor, Object.fromEntries(params)));
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to create albums.");
    return json(
      await services.albums.create(actor, await readMutation(request, 65_536)),
      201,
    );
  });
}
