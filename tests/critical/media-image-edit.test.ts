import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  editedImage,
  imageEditSchema,
} from "../../src/features/media/image_editing";
import { imageThumbnail } from "../../src/features/media/image_preview";
import type { MediaAssetDto } from "../../src/features/media/media_schemas";

const asset: MediaAssetDto = {
  kind: "image",
  id: "22222222-2222-4222-8222-222222222222",
  originalName: "synthetic.png",
  title: "Synthetic",
  alt: "",
  caption: "",
  collection: "",
  tags: [],
  visibility: "private",
  width: 120,
  height: 80,
  size: 100,
  mimeType: "image/webp",
  createdAt: "2026-10-14T00:00:00.000Z",
};
const revision = "0".repeat(64);

describe("media image edits and optimized previews", () => {
  it("crops, rotates, flips and downscales an edited copy without mutating original bytes", async () => {
    const original = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "#d26744" },
    })
      .withExif({ IFD0: { Artist: "Synthetic fixture" } })
      .png()
      .toBuffer();
    const before = Buffer.from(original);
    const edit = imageEditSchema.parse({
      requestId: asset.id,
      expectedRevision: revision,
      crop: { left: 10, top: 5, width: 100, height: 60 },
      rotate: 90,
      flipHorizontal: true,
      flipVertical: true,
      width: 30,
    });
    const result = await editedImage(original, asset, edit);
    expect(await sharp(result).metadata()).toMatchObject({
      format: "webp",
      width: 30,
      height: 50,
    });
    expect((await sharp(result).metadata()).exif).toBeUndefined();
    expect(original.equals(before)).toBe(true);
    expect(await sharp(original).metadata()).toMatchObject({
      width: 120,
      height: 80,
    });
  });

  it("rejects crops outside original bounds, enlargement and unexpected edit fields", async () => {
    const original = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(
      editedImage(
        original,
        asset,
        imageEditSchema.parse({
          requestId: asset.id,
          expectedRevision: revision,
          crop: { left: 100, top: 0, width: 21, height: 10 },
        }),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_CROP_INVALID" });
    await expect(
      editedImage(
        original,
        asset,
        imageEditSchema.parse({
          requestId: asset.id,
          expectedRevision: revision,
          width: 121,
        }),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_SCALE_INVALID" });
    for (const invalid of [
      { requestId: asset.id, expectedRevision: revision, rotate: 45 },
      {
        requestId: asset.id,
        expectedRevision: revision,
        crop: { left: -1, top: 0, width: 10, height: 10 },
      },
      { requestId: asset.id, expectedRevision: revision, visibility: "public" },
      { rotate: 90 },
    ])
      expect(imageEditSchema.safeParse(invalid).success).toBe(false);
  });

  it("delivers small stripped WebP previews and reuses concurrent identical processing", async () => {
    const original = await sharp({
      create: { width: 1800, height: 1200, channels: 3, background: "#25636b" },
    })
      .withExif({ IFD0: { Artist: "Synthetic private fixture" } })
      .png()
      .toBuffer();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => imageThumbnail(original)),
    );
    expect(new Set(results).size).toBe(1);
    const metadata = await sharp(results[0]).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 320, height: 213 });
    expect(metadata.exif).toBeUndefined();
    expect(results[0].length).toBeLessThan(original.length);
    expect(await imageThumbnail(original)).toBe(results[0]);
  });
});
