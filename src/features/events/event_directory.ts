import { z } from "zod";

export const eventDirectoryDesignSchema = z.strictObject({
  eyebrow: z.string().trim().max(100),
  title: z.string().trim().min(1).max(160),
  introduction: z.string().trim().max(1500),
  coverImageId: z.uuid().nullable(),
  alignment: z.enum(["left", "center"]),
  tone: z.enum(["plain", "soft", "dark"]),
  layout: z.enum(["cards", "list"]),
  defaultPeriod: z.enum(["upcoming", "past", "all"]),
  showFilters: z.boolean(),
  showImages: z.boolean(),
  showDescriptions: z.boolean(),
  showVenues: z.boolean(),
  buttonLabel: z.string().trim().min(1).max(60),
  emptyMessage: z.string().trim().min(1).max(300),
  seoTitle: z.string().trim().max(160),
  seoDescription: z.string().trim().max(300),
});
export type EventDirectoryDesign = z.infer<typeof eventDirectoryDesignSchema>;
export const defaultEventDirectoryDesign: EventDirectoryDesign = {
  eyebrow: "Meet. Connect. Take part.",
  title: "Club events",
  introduction: "Discover what is happening in our community.",
  coverImageId: null,
  alignment: "left",
  tone: "plain",
  layout: "cards",
  defaultPeriod: "upcoming",
  showFilters: true,
  showImages: true,
  showDescriptions: true,
  showVenues: true,
  buttonLabel: "Event details",
  emptyMessage: "No events to show for this period. Check back soon.",
  seoTitle: "Events",
  seoDescription: "Discover what is happening in our community.",
};
export type EventDirectoryWorkspace = {
  version: number;
  draft: EventDirectoryDesign;
  published: EventDirectoryDesign | null;
  replacesWebsitePage: boolean;
};
