import "server-only";
import { createHash } from "node:crypto";
import { DomainError } from "@/core/DomainError";
import type { TrustedActor } from "@/core/authorization/AuthorizationService";
import type { MediaService, MediaUploadCommit } from "./MediaService";
import { editedImage, imageEditSchema } from "./image_editing";
import { mediaMetadataRevision } from "./media_automation";

/** Both administration and automation produce copies through the native upload writer. */
export class MediaImageEditingService {
  constructor(private readonly media: MediaService) {}

  async copy(
    actor: TrustedActor,
    id: string,
    raw: unknown,
    options: {
      privateCopy?: boolean;
      reauthorize?: () => Promise<void>;
      commit?: MediaUploadCommit;
    } = {},
  ) {
    const input = imageEditSchema.parse(raw);
    const asset = await this.media.detail(actor, id);
    const current = async () => {
      await options.reauthorize?.();
      const latest = await this.media.detail(actor, id);
      if (mediaMetadataRevision(latest) !== input.expectedRevision)
        throw new DomainError(
          "MEDIA_METADATA_CHANGED",
          "This image changed. Reopen its details before editing a copy.",
          409,
        );
    };
    await current();
    const source = await this.media.read(actor, id);
    const bytes = await editedImage(source.bytes, asset, input);
    return this.media.uploadFromAdministration(
      actor,
      {
        bytes,
        requestId: input.requestId,
        sourceFingerprint: createHash("sha256")
          .update(JSON.stringify({ id, ...input }))
          .digest("hex"),
        filename: `${asset.originalName.replace(/\.[^.]+$/, "").slice(0, 155)}-edited.webp`,
        title: `${asset.title || asset.originalName} (edited)`.slice(0, 160),
        alt: asset.alt,
        caption: asset.caption,
        collection: asset.collection,
        tags: asset.tags,
        visibility: options.privateCopy ? "private" : asset.visibility,
      },
      current,
      { id: asset.id, expectedRevision: input.expectedRevision },
      options.commit,
    );
  }
}
