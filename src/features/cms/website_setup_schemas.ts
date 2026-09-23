import { z } from "zod";
import { kitIdSchema, recipeIdSchema } from "./kits/catalogue";
import type { CmsSummary, SiteDraft } from "./cms_schemas";

/** Installation membership uses content IDs, so renaming a page never creates a duplicate. */
export const websiteTemplateSetupSchema = z
  .strictObject({
    selectedKitId: kitIdSchema,
    installations: z
      .array(
        z.strictObject({
          kitId: kitIdSchema,
          recipes: z
            .array(z.strictObject({ recipe: recipeIdSchema, id: z.uuid() }))
            .min(3)
            .max(15)
            .refine(
              (items) =>
                new Set(items.map((item) => item.recipe)).size ===
                  items.length &&
                new Set(items.map((item) => item.id)).size === items.length,
            ),
        }),
      )
      .max(20)
      .refine(
        (items) =>
          new Set(items.map((item) => item.kitId)).size === items.length,
      ),
  })
  .refine((value) =>
    value.installations.some((item) => item.kitId === value.selectedKitId),
  );

export type WebsiteWorkspace = {
  site: SiteDraft;
  contents: CmsSummary[];
  selection: {
    kitId: z.infer<typeof kitIdSchema>;
    contentIds: string[];
  } | null;
};
