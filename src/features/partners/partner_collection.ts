import { z } from "zod";
import { collectionQuerySchema, type CollectionPage } from "@/core/collections";
import type { PartnerDto } from "./partner_schemas";

export const partnerCollectionSchema = collectionQuerySchema.extend({
  category: z.enum(["all", "partner", "sponsor", "team"]).default("all"),
  status: z.enum(["all", "published", "draft", "changes"]).default("all"),
});
export type PartnerCollection = CollectionPage & {
  items: PartnerDto[];
  counts: Record<"all" | "published" | "draft" | "changes", number>;
  categories: Record<"all" | "partner" | "sponsor" | "team", number>;
};
