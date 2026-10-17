import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    const input = await readMutation(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in before uploading.");
    await services.authorization.require(actor, "media.manage");
    await services.limiter.consume("media-upload", actor.userId, 120);
    return json(await services.mediaUploads.start(actor, input), 201);
  });
}
