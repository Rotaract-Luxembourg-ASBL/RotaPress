import { z } from "zod";
import { mediaMetadataSchema } from "./media_schemas";

export const albumDataSchema = z.strictObject({
  title: mediaMetadataSchema.shape.title.removeDefault().min(1),
  description: mediaMetadataSchema.shape.caption.default(""),
  items: z
    .array(
      z.strictObject({
        assetId: z.uuid(),
        alt: mediaMetadataSchema.shape.alt,
        caption: mediaMetadataSchema.shape.caption,
        focalX: z.number().int().min(0).max(100).optional(),
        focalY: z.number().int().min(0).max(100).optional(),
      }),
    )
    .max(30)
    .refine(
      (items) =>
        new Set(items.map((item) => item.assetId)).size === items.length,
      "Choose each photograph once.",
    ),
  columns: z.enum(["two", "three", "four"]).default("three"),
  aspectRatio: z
    .enum(["original", "square", "landscape", "portrait", "wide"])
    .default("landscape"),
  layout: z.enum(["grid", "masonry", "slider"]).default("grid"),
  fit: z.enum(["cover", "contain"]).default("cover"),
  lightbox: z.boolean().default(true),
});
export const albumListSchema = z.strictObject({
  search: z.string().trim().max(160).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export const albumSaveSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  data: albumDataSchema,
});
export const albumVersionSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
});
export type AlbumData = z.infer<typeof albumDataSchema>;
export type AlbumDetail = {
  id: string;
  version: number;
  draft: AlbumData;
  draftRevisionId: string;
  publishedRevisionId: string | null;
  published: AlbumData | null;
  updatedAt: string;
  savedReferences: number;
  publishedReferences: number;
};
export type AlbumSummary = Pick<
  AlbumDetail,
  "id" | "version" | "draftRevisionId" | "publishedRevisionId" | "updatedAt"
> & {
  title: string;
  description: string;
  imageCount: number;
  coverAssetId: string | null;
};
export type AlbumCollection = {
  albums: AlbumSummary[];
  page: number;
  pageSize: number;
  total: number;
};
