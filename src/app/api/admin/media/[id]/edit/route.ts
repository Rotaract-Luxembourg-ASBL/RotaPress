import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { imageEditSchema } from "@/features/media/image_editing";
import { MediaImageEditingService } from "@/features/media/MediaImageEditingService";
import { mediaMetadataRevision } from "@/features/media/media_automation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const input = imageEditSchema.parse(await readMutation(request));
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in before editing an image.");
    await services.authorization.require(actor, "media.manage");
    await services.limiter.consume("media-edit", actor.userId, 20);
    const { id } = await context.params;
    const created = await new MediaImageEditingService(services.media).copy(actor, id, input);
    return json(
      { ...created, metadataRevision: mediaMetadataRevision(created) },
      201,
    );
  });
}
