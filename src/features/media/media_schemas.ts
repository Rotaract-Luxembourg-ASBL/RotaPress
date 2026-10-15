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
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

const batchAssetsSchema = z.array(z.strictObject({
  id: z.uuid(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
})).min(1).max(250).refine(
  (assets) => new Set(assets.map((asset) => asset.id)).size === assets.length,
  "Select each image once.",
);

export const mediaBatchUpdateSchema = z.union([
  z.strictObject({
    assets: batchAssetsSchema,
    visibility: z.enum(["private", "public"]),
  }),
  z.strictObject({
    assets: batchAssetsSchema,
    collection: mediaMetadataSchema.shape.collection.removeDefault().optional(),
    tags: mediaMetadataSchema.shape.tags.removeDefault().optional(),
  }).refine((input) => input.collection !== undefined || input.tags !== undefined,
    "Choose a collection or tags to update."),
]);

export const mediaBatchDeleteSchema = z.strictObject({ assets: batchAssetsSchema });

const dateFilter = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Choose a valid date.",
).optional();

export const mediaAdminListSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(48),
  search: cleanText(160).default(""),
  visibility: z.enum(["all", "public", "private"]).default("all"),
  collection: cleanText(80).default(""),
  dateFrom: dateFilter,
  dateTo: dateFilter,
  sort: z.enum(["newest", "oldest", "title"]).default("newest"),
}).refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo,
  "The end date must be on or after the start date.");

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
export type AdminMediaAssetDto = MediaAssetDto & { metadataRevision: string };
export type MediaAdminListInput = z.infer<typeof mediaAdminListSchema>;
