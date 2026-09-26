import { z } from "zod";
import { cmsLocaleSchema } from "@/features/cms/cms_schemas";

export const previewInput = z.strictObject({
  id: z.uuid(),
  locale: cmsLocaleSchema.default("en"),
  expectedRevisionId: z.uuid(),
  device: z.enum(["desktop", "phone"]).default("desktop"),
  offsetY: z.int().min(0).max(30000).default(0),
});

export const previewOutput = z.strictObject({
  id: z.uuid(),
  locale: cmsLocaleSchema,
  revisionId: z.uuid(),
  device: z.enum(["desktop", "phone"]),
  width: z.int().min(1).max(1440),
  height: z.int().min(1).max(2400),
  offsetY: z.int().min(0).max(30000),
  pageHeight: z.int().min(1).max(1000000),
  nextOffsetY: z.int().min(1).max(30000).nullable(),
  layoutOverflow: z.boolean(),
  capturedAt: z.iso.datetime(),
  appearance: z.literal("published"),
  image: z.strictObject({
    mimeType: z.literal("image/webp"),
    data: z.string().min(1).max(819200),
  }),
  warnings: z.array(z.string().max(300)).max(12),
  reviewUrl: z.string().max(300),
});

export type PreviewInput = z.output<typeof previewInput>;
export type PreviewOutput = z.output<typeof previewOutput>;
