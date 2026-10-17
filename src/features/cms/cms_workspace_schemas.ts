import { z } from "zod";
import {
  cmsDataSchema,
  cmsLocaleSchema,
  revisionInputSchema,
  slugSchema,
  type CmsSummary,
} from "./cms_schemas";
import { expectedInput, saveInput } from "./cms_commands";

export const pageQuerySchema = z.object({
  id: z.uuid().optional(),
  locale: cmsLocaleSchema.default("en"),
  kind: z.enum(["page", "section"]).default("page"),
  status: z
    .enum(["all", "draft", "published", "changes", "archived"])
    .default("all"),
  search: z.string().trim().max(200).default(""),
  sort: z.enum(["updated", "title", "created", "order"]).default("updated"),
  collection: z.enum(["all", "website", "examples"]).default("website"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  parentId: z.union([z.uuid(), z.literal("root")]).optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;
export type PageRow = CmsSummary & {
  parentId: string | null;
  parentTitle: string | null;
  position: number;
  placementVersion: number;
  childCount: number;
};
export type PageCollection = {
  items: PageRow[];
  page: number;
  pageSize: number;
  total: number;
  counts: Record<PageQuery["status"], number>;
};
export const pageBatchSchema = z.strictObject({
  action: z.enum(["publish", "unpublish", "archive", "restore-archived"]),
  items: z
    .array(expectedInput.extend({ archived: z.boolean() }))
    .min(1)
    .max(100)
    .refine(
      (items) =>
        new Set(items.map((item) => `${item.id}:${item.locale}`)).size ===
        items.length,
    ),
});
export const quickEditSchema = expectedInput.extend({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema,
  parentId: z.uuid().nullable(),
  position: z.number().int().min(0).max(100000),
  expectedPlacementVersion: z.number().int().nonnegative(),
});
export const pageMoveSchema = expectedInput
  .extend({
    parentId: z.uuid().nullable(),
    beforeId: z.uuid().nullable(),
    expectedPlacementVersion: z.number().int().nonnegative(),
    expectedBeforeVersion: z.number().int().nonnegative().optional(),
  })
  .refine(
    (value) => !value.beforeId || value.expectedBeforeVersion !== undefined,
    {
      message: "The destination page order version is required.",
      path: ["expectedBeforeVersion"],
    },
  );
export const checkpointSaveSchema = saveInput.extend({
  expectedCheckpointVersion: z.number().int().nonnegative(),
});
export const checkpointDiscardSchema = expectedInput
  .pick({ id: true, locale: true })
  .extend({ expectedCheckpointVersion: z.number().int().positive() });
export type EditorCheckpoint = {
  document: z.infer<typeof revisionInputSchema>;
  baseRevisionId: string;
  version: number;
  updatedAt: string;
  stale: boolean;
};
export const patternSaveSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  locale: cmsLocaleSchema,
  data: cmsDataSchema,
});
