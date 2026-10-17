import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import { MAX_IMAGE_PIXELS, type MediaAssetDto } from "./media_schemas";
import { withAutomationImageWork } from "./media_automation";

export const imageEditSchema = z.strictObject({
  requestId: z.uuid(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  crop: z
    .strictObject({
      left: z.number().int().min(0),
      top: z.number().int().min(0),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
    })
    .optional(),
  rotate: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .default(0),
  flipHorizontal: z.boolean().default(false),
  flipVertical: z.boolean().default(false),
  width: z.number().int().min(1).max(20_000).optional(),
});

export type ImageEdit = z.infer<typeof imageEditSchema>;

/** Edits produce a new normalized image; originals and published references stay intact. */
export async function editedImage(
  bytes: Buffer,
  asset: MediaAssetDto,
  edit: ImageEdit,
) {
  if (asset.kind !== "image") throw new DomainError("MEDIA_IMAGE_REQUIRED", "Choose a photograph to edit.", 422);
  const crop = edit.crop ?? {
    left: 0,
    top: 0,
    width: asset.width,
    height: asset.height,
  };
  if (
    crop.left + crop.width > asset.width ||
    crop.top + crop.height > asset.height
  )
    throw new DomainError(
      "MEDIA_CROP_INVALID",
      "The crop must fit inside the original image.",
      422,
    );
  const rotatedWidth =
    edit.rotate === 90 || edit.rotate === 270 ? crop.height : crop.width;
  if (edit.width && edit.width > rotatedWidth)
    throw new DomainError(
      "MEDIA_SCALE_INVALID",
      "Choose a width no larger than the edited image.",
      422,
    );
  return withAutomationImageWork(async () => {
    try {
      // Materialize crop before rotation so coordinates always refer to the original.
      const cropped = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS })
        .extract(crop)
        .toBuffer();
      const rotated = await sharp(cropped, {
        limitInputPixels: MAX_IMAGE_PIXELS,
      })
        .rotate(edit.rotate)
        .toBuffer();
      let image = sharp(rotated, { limitInputPixels: MAX_IMAGE_PIXELS });
      if (edit.flipHorizontal) image = image.flop();
      if (edit.flipVertical) image = image.flip();
      if (edit.width)
        image = image.resize({ width: edit.width, withoutEnlargement: true });
      return await image.webp({ quality: 85 }).toBuffer();
    } catch {
      throw new DomainError(
        "MEDIA_EDIT_FAILED",
        "This image could not be edited. Adjust the crop and try again.",
        422,
      );
    }
  });
}
