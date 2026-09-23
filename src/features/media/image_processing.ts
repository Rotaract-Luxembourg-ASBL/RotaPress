import "server-only";
import sharp from "sharp";
import { DomainError } from "../../core/authorization/AuthorizationService";
import { MAX_IMAGE_PIXELS, MAX_UPLOAD_BYTES } from "./media_schemas";

function signature(bytes: Buffer): "png" | "jpeg" | "webp" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function prepareImage(bytes: Buffer) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
    throw new DomainError("UPLOAD_SIZE_INVALID", "Choose an image no larger than 5 MiB.", 422);
  }
  const format = signature(bytes);
  if (!format) throw new DomainError("UPLOAD_TYPE_INVALID", "Only PNG, JPEG and WebP images are accepted.", 422);
  try {
    const processor = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS, animated: false });
    const metadata = await processor.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height
      || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new Error("Invalid image dimensions or format.");
    }
    // Sharp discards metadata by default. Decode/reencode removes the original
    // container, metadata and any appended active payload, retaining pixels only.
    const result = await processor.rotate().webp({ quality: 85, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (result.data.length > MAX_UPLOAD_BYTES) throw new Error("Encoded image is too large.");
    return { bytes: result.data, width: result.info.width, height: result.info.height };
  } catch {
    throw new DomainError("UPLOAD_IMAGE_INVALID", "Choose a valid, single-frame image with at most 20 million pixels.", 422);
  }
}
