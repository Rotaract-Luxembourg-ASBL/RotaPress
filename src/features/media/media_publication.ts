import { z } from "zod";

/** Publish only the exact reviewed assets; duplicates cannot conceal a larger target set. */
export const reviewedMediaPublicationSchema = z.strictObject({
  assets: z
    .array(
      z.strictObject({
        id: z.uuid(),
        expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(50)
    .refine(
      (assets) =>
        new Set(assets.map((asset) => asset.id)).size === assets.length,
      "Choose each reviewed image once.",
    ),
  confirmed: z.literal(true),
});
