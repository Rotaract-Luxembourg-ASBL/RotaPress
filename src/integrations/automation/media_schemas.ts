import { z } from "zod";
import { mediaMetadataSchema } from "@/features/media/media_schemas";
import { mediaOutput } from "./response_schemas";

export const MAX_INLINE_IMAGE_BYTES = 180 * 1024;
export const imageMimeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export const mediaUploadMetadata = mediaMetadataSchema
  .extend({
    requestId: z.uuid(),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine(
        (name) =>
          !name.includes("/") &&
          !name.includes("\\") &&
          !name.includes(":") &&
          [...name].every(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          ),
        "Use a filename without paths or control characters.",
      ),
  })
  .strict();
export const mediaUploadInput = mediaUploadMetadata
  .extend({
    mimeType: imageMimeSchema,
    data: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_INLINE_IMAGE_BYTES / 3) * 4)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
        "Use canonical base64 image bytes, without a data URL prefix.",
      ),
  })
  .strict();
export const mediaDetailOutput = z.strictObject({
  asset: mediaOutput,
  metadataRevision: z.string().regex(/^[a-f0-9]{64}$/),
});
export const mediaInspectOutput = mediaDetailOutput.extend({
  image: z.strictObject({
    data: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_INLINE_IMAGE_BYTES / 3) * 4),
    mimeType: z.literal("image/webp"),
    width: z.int().min(1).max(1024),
    height: z.int().min(1).max(1024),
  }),
});
