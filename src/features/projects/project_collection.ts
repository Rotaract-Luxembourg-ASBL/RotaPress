import { z } from "zod";
import { collectionQuerySchema, type CollectionPage } from "@/core/collections";
import type { ProjectDto } from "./project_schemas";

export const projectCollectionSchema = collectionQuerySchema.extend({
  status: z
    .enum(["all", "active", "published", "draft", "archived"])
    .default("active"),
  sort: z.enum(["updated", "title"]).default("updated"),
});
export type ProjectCollection = CollectionPage & {
  items: ProjectDto[];
  counts: Record<"all" | "active" | "published" | "draft" | "archived", number>;
};
