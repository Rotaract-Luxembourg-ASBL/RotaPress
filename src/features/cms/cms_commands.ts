import { z } from "zod";
import { eventPageModuleKeySchema } from "../events/event_modules";
import { pageTemplateIdSchema } from "./page_templates";
import {
  cmsKindSchema,
  cmsLocaleSchema,
  revisionInputSchema,
  slugSchema,
} from "./cms_schemas";

export const contentId = z.uuid();
export const variantInput = z.strictObject({
  id: contentId,
  locale: cmsLocaleSchema,
});
export const expectedInput = variantInput.extend({
  expectedRevisionId: z.uuid(),
});
export const createInput = z.strictObject({
  kind: cmsKindSchema,
  locale: cmsLocaleSchema,
  title: z.string().trim().min(1).max(160),
  slug: slugSchema,
  templateId: pageTemplateIdSchema.default("blank"),
  event: z
    .strictObject({ id: z.uuid(), moduleKey: eventPageModuleKeySchema })
    .optional(),
});
export const saveInput = expectedInput.extend(revisionInputSchema.shape);
export const duplicateInput = variantInput.extend({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema,
});
export const restoreInput = expectedInput.extend({ revisionId: z.uuid() });
export const revisionReadInput = variantInput.extend({ revisionId: z.uuid() });
