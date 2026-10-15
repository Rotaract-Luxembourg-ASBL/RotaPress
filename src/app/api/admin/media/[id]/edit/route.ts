import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { DomainError } from "@/core/DomainError";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { imageEditSchema, editedImage } from "@/features/media/image_editing";
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
    const asset = await services.media.detail(actor, id);
    if (mediaMetadataRevision(asset) !== input.expectedRevision)
      throw new DomainError(
        "MEDIA_METADATA_CHANGED",
        "This image changed. Reopen its details before editing a copy.",
        409,
      );
    const current = async () => {
      const latest = await services.media.detail(actor, id);
      if (mediaMetadataRevision(latest) !== input.expectedRevision)
        throw new DomainError(
          "MEDIA_METADATA_CHANGED",
          "This image changed. Reopen its details before editing a copy.",
          409,
        );
    };
    await current();
    const source = await services.media.read(actor, id);
    const bytes = await editedImage(source.bytes, asset, input);
    const created = await services.media.uploadFromAdministration(
      actor,
      {
        bytes,
        requestId: input.requestId,
        filename: `${asset.originalName.replace(/\.[^.]+$/, "").slice(0, 155)}-edited.webp`,
        title: `${asset.title || asset.originalName} (edited)`.slice(0, 160),
        alt: asset.alt,
        caption: asset.caption,
        collection: asset.collection,
        tags: asset.tags,
        visibility: asset.visibility,
      },
      current,
      { id: asset.id, expectedRevision: input.expectedRevision },
    );
    return json(
      { ...created, metadataRevision: mediaMetadataRevision(created) },
      201,
    );
  });
}
