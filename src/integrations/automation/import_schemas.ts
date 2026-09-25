import { z } from "zod";
import { cmsLocaleSchema, slugSchema } from "@/features/cms/cms_schemas";
import { referenceUrlSchema } from "./reference_content";

export const importPagesInput = z.strictObject({
  requestId: z
    .uuid()
    .describe("Reuse this UUID only when retrying the exact same import."),
  pages: z
    .array(
      z.strictObject({
        locale: cmsLocaleSchema,
        title: z.string().trim().min(1).max(160),
        slug: slugSchema,
        description: z.string().max(300).default(""),
        sourceUrl: referenceUrlSchema.optional(),
        sections: z
          .array(
            z.strictObject({
              heading: z.string().trim().max(250).optional(),
              text: z
                .string()
                .trim()
                .min(1)
                .max(4000)
                .describe("Plain text only; markup is escaped."),
            }),
          )
          .min(1)
          .max(12),
      }),
    )
    .min(1)
    .max(10),
});
export const importReceiptSchema = z.strictObject({
  requestId: z.uuid(),
  status: z.literal("private-drafts"),
  pages: z.array(
    z.strictObject({
      id: z.uuid(),
      locale: cmsLocaleSchema,
      title: z.string(),
      slug: z.string(),
      sourceUrl: z.string().nullable(),
      reviewUrl: z.string(),
    }),
  ),
});
