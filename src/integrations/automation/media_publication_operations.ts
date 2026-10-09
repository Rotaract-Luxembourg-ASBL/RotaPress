import { z } from "zod";
import { mediaMetadataRevision } from "@/features/media/media_automation";
import { reviewedMediaPublicationSchema } from "@/features/media/media_publication";
import { exampleId } from "./examples";
import { mediaDetailOutput } from "./media_schemas";
import { requireMediaScope } from "./media_upload";
import { operation } from "./operation";
import { publicationConfirmation } from "./publication_policy";

export const mediaPublicationOperations = [
  operation(
    {
      name: "media_publish",
      method: "POST",
      path: "/media/publish",
      scope: "media:publish",
      description:
        "Make 1–50 exact reviewed images publicly retrievable ONLY after the user explicitly requests this batch. Read each image with media_get or media_inspect and pass its current metadataRevision as expectedRevision, with confirmed:true. This atomic batch preserves image bytes and metadata; any unavailable or changed image rejects the entire batch. Anyone can retrieve public media URLs, even without a published page placement. Returns exact public assets and new fingerprints. Does not publish pages, settings or other dependencies. Uploads remain private; no hide/delete action is available. If a response is lost, read the exact IDs again to resolve current visibility before retrying.",
      input: reviewedMediaPublicationSchema.extend({
        confirmed: publicationConfirmation,
      }),
      output: z.strictObject({
        items: z
          .array(
            mediaDetailOutput.extend({
              asset: mediaDetailOutput.shape.asset.extend({
                visibility: z.literal("public"),
              }),
              mediaUrl: z.string(),
            }),
          )
          .min(1)
          .max(50),
        reviewUrl: z.literal("/admin/media"),
      }),
      example: {
        assets: [{ id: exampleId, expectedRevision: "0".repeat(64) }],
        confirmed: true,
      },
    },
    async (context, input) => {
      await requireMediaScope(context, "media:publish");
      await context.services.limiter.consume(
        "automation-media-publish",
        context.principal.actor.userId,
        30,
      );
      await requireMediaScope(context, "media:publish", true);
      const assets = await context.services.media.publishReviewed(
        context.principal.actor,
        input,
      );
      return {
        items: assets.map((asset) => ({
          asset,
          metadataRevision: mediaMetadataRevision(asset),
          mediaUrl: `/media/${asset.id}`,
        })),
        reviewUrl: "/admin/media",
      };
    },
  ),
];
