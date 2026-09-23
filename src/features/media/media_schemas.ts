import { z } from "zod";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;

const cleanText = (max: number) => z.string().trim().max(max).refine(
  (text) => [...text].every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127 || character === "\n" || character === "\t";
  }), "Remove unsupported control characters.",
);

export const mediaMetadataSchema = z.object({
  title: cleanText(160).default(""),
  alt: cleanText(300).default(""),
  caption: cleanText(1000).default(""),
  tags: z.array(cleanText(40).min(1)).max(12).default([]),
  collection: cleanText(80).default(""),
}).strict();

export const mediaUpdateSchema = mediaMetadataSchema.extend({
  id: z.uuid(),
  visibility: z.enum(["private", "public"]),
}).strict();

export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;
export type MediaAssetDto = MediaMetadata & {
  id: string;
  visibility: "private" | "public";
  mimeType: "image/webp";
  originalName: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
};
