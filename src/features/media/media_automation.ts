import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import {
  mediaMetadataSchema,
  MAX_IMAGE_PIXELS,
  type MediaAssetDto,
} from "./media_schemas";

export const MAX_AUTOMATION_IMAGE_BYTES = 180 * 1024;
let activeImageWork = 0;

/** Bounded process work avoids a burst of valid large images exhausting memory. */
export async function withAutomationImageWork<T>(
  work: () => Promise<T>,
): Promise<T> {
  if (activeImageWork >= 2)
    throw new DomainError(
      "MEDIA_BUSY",
      "Image processing is busy. Wait before retrying.",
      429,
    );
  activeImageWork += 1;
  try {
    return await work();
  } finally {
    activeImageWork -= 1;
  }
}

export const privateMetadataSchema = mediaMetadataSchema
  .extend({
    id: z.uuid(),
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

/** A content fingerprint avoids leaking internal timestamps or adding a second version counter. */
export function mediaMetadataRevision(
  asset: Pick<
    MediaAssetDto,
    "id" | "visibility" | "title" | "alt" | "caption" | "tags" | "collection"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        asset.id,
        asset.visibility,
        asset.title,
        asset.alt,
        asset.caption,
        asset.tags,
        asset.collection,
      ]),
    )
    .digest("hex");
}

/** Only normalized storage images enter this conversion; original EXIF is never returned. */
export async function inspectImage(bytes: Buffer) {
  try {
    for (const [side, quality] of [
      [1024, 75],
      [768, 65],
      [512, 55],
      [256, 45],
    ]) {
      const result = await sharp(bytes, {
        limitInputPixels: MAX_IMAGE_PIXELS,
        animated: false,
        failOn: "warning",
      })
        .resize({
          width: side,
          height: side,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality, effort: 3 })
        .toBuffer({ resolveWithObject: true });
      if (result.data.length <= MAX_AUTOMATION_IMAGE_BYTES) {
        return {
          data: result.data.toString("base64"),
          mimeType: "image/webp" as const,
          width: result.info.width,
          height: result.info.height,
        };
      }
    }
  } catch {
    // The enclosing HTTP boundary must never expose decoder/storage diagnostics.
  }
  throw new DomainError(
    "MEDIA_INSPECTION_FAILED",
    "This image could not be prepared for inspection.",
    500,
  );
}
