import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { DomainError } from "@/core/DomainError";
import { MAX_IMAGE_PIXELS } from "./media_schemas";

const previews = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
const waiting: Array<() => void> = [];
let active = 0;
let cacheBytes = 0;
const maxCacheBytes = 8 * 1024 * 1024;

/** Authorization happens at delivery, including for a cached private preview. */
export async function imageThumbnail(bytes: Buffer): Promise<Buffer> {
  const key = createHash("sha256").update(bytes).digest("hex");
  const cached = previews.get(key);
  if (cached) {
    previews.delete(key);
    previews.set(key, cached);
    return cached;
  }
  const existing = pending.get(key);
  if (existing) return existing;
  if (waiting.length >= 96)
    throw new DomainError(
      "MEDIA_BUSY",
      "Image previews are busy. Try again.",
      429,
    );
  const work = (async () => {
    if (active >= 2)
      await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      const result = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS })
        .resize({
          width: 320,
          height: 320,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 72, effort: 2 })
        .toBuffer();
      while (
        previews.size >= 64 ||
        cacheBytes + result.length > maxCacheBytes
      ) {
        const oldest = previews.keys().next().value;
        if (!oldest) break;
        cacheBytes -= previews.get(oldest)!.length;
        previews.delete(oldest);
      }
      previews.set(key, result);
      cacheBytes += result.length;
      return result;
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
