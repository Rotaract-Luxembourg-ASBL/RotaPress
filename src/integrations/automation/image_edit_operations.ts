import { z } from "zod";
import { MediaImageEditingService } from "@/features/media/MediaImageEditingService";
import { imageEditSchema } from "@/features/media/image_editing";
import { mediaMetadataRevision } from "@/features/media/media_automation";
import { operation, reauthorizeContext } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { mediaDetailOutput } from "./media_schemas";
import { exampleId } from "./examples";

export const imageEditOperations = [
  operation(
    {
      name: "media_edit_copy",
      method: "POST",
      path: "/media/{id}/edited-copy",
      scope: "media:manage",
      effect: "draft",
      description:
        "Crop, rotate, flip or downscale the requested image into a new private WebP copy. Crop pixels refer to the original image before rotation. The original and placements remain unchanged; replacing a placement uses its normal versioned page or album editor. Retry the same requestId and exact edit to recover its saved copy.",
      input: imageEditSchema.extend({ id: z.uuid(), ...receiptFields }),
      output: mediaDetailOutput,
      example: {
        id: exampleId,
        requestId: exampleId,
        expectedRevision: "0".repeat(64),
        rotate: 90,
      },
    },
    async (context, input) => {
      const recovered = await context.services.automationRuntime.recover(
        context,
        "media_edit_copy",
        input,
        mediaDetailOutput,
        (tx) =>
          context.services.media.detail(context.principal.actor, input.id, tx),
      );
      if (recovered.found) return recovered.value;
      await context.services.limiter.consume(
        "media-edit",
        context.principal.actor.userId,
        20,
      );
      const asset = await new MediaImageEditingService(
        context.services.media,
      ).copy(
        context.principal.actor,
        input.id,
        imageEditSchema.strip().parse(input),
        {
          privateCopy: true,
          reauthorize: () => reauthorizeContext(context),
          commit: async (persist) => ({
            ...(
              await executeReceipt(
                context,
                "media_edit_copy",
                input,
                mediaDetailOutput,
                (tx) =>
                  context.services.media.detail(
                    context.principal.actor,
                    input.id,
                    tx,
                  ),
                async (tx) => {
                  const saved = await persist(tx);
                  return {
                    asset: saved,
                    metadataRevision: mediaMetadataRevision(saved),
                  };
                },
              )
            ).asset,
            kind: "image",
          }),
        },
      );
      return { asset, metadataRevision: mediaMetadataRevision(asset) };
    },
  ),
];
