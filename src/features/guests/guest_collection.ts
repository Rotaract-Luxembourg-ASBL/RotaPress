import { z } from "zod";
import { collectionQuerySchema } from "@/core/collections";

export const guestCollectionSchema = collectionQuerySchema.extend({
  candidatePage: z.coerce.number().int().min(1).max(100000).default(1),
  source: z.enum(["all", "native", "luma"]).default("all"),
});
export type GuestCollectionQuery = z.infer<typeof guestCollectionSchema>;
