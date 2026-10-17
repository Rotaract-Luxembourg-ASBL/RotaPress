import { z } from "zod";
import { collectionQuerySchema, type CollectionPage } from "@/core/collections";
import type { ScheduleRecord } from "./calendar_schemas";

export const calendarActivityQuerySchema = collectionQuerySchema.extend({
  calendarId: z.uuid().optional(),
  status: z
    .enum(["all", "active", "published", "draft", "archived"])
    .default("active"),
});
export type CalendarActivityCollection = CollectionPage & {
  items: ScheduleRecord[];
  counts: Record<"all" | "active" | "published" | "draft" | "archived", number>;
};
