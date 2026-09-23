import { z } from "zod";
import { isSafeLink } from "../../core/safe-link";
import { blockDesignSchema } from "./block_design";
import { templateImageIdSchema } from "./kits/template_images";

export const text = z.string().max(5_000);
export const shortText = z.string().max(250);
export const assetId = z.union([z.uuid(), z.literal(""), templateImageIdSchema]);
export const aspectRatio = z.enum([
  "original",
  "square",
  "landscape",
  "portrait",
  "wide",
]);
export const link = z
  .string()
  .max(2_000)
  .refine(
    isSafeLink,
    "Use a local path or an http(s) link without credentials.",
  );
export const featureIcon = z.enum([
  "none",
  "heart",
  "people",
  "globe",
  "spark",
  "calendar",
]);
export const block = <T extends string, S extends z.ZodRawShape>(
  type: T,
  props: S,
) =>
  z.strictObject({
    type: z.literal(type),
    props: z.strictObject({
      id: z.string().min(1).max(128),
      version: z.literal(1),
      design: blockDesignSchema.optional(),
      ...props,
    }),
  });
