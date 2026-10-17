import { z } from "zod";
import { collectionQuerySchema } from "@/core/collections";
import type { EventSummary } from "./event_schemas";

export const eventCollectionSchema = collectionQuerySchema.extend({
  status: z
    .enum(["all", "active", "published", "draft", "cancelled", "archived"])
    .default("active"),
  timing: z.enum(["all", "upcoming", "past"]).default("all"),
  sort: z.enum(["newest", "title", "starts"]).default("newest"),
});
export type EventCollectionQuery = z.infer<typeof eventCollectionSchema>;
export type EventCollection = {
  events: EventSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<
    | "all"
    | "active"
    | "published"
    | "draft"
    | "cancelled"
    | "archived"
    | "upcoming",
    number
  >;
};
