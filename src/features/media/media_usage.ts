import { z } from "zod";

export const mediaUsageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export const mediaUsageDestinationSchema = z.strictObject({
  href: z.string(),
  title: z.string(),
  kind: z.enum(["page", "album", "website", "project", "profile"]),
  published: z.boolean(),
  retained: z.boolean(),
});
export const mediaUsagePageSchema = z.strictObject({
  destinations: z.array(mediaUsageDestinationSchema),
  total: z.int().nonnegative(),
  page: z.int().positive(),
  pageSize: z.int().positive(),
  savedReferences: z.int().nonnegative(),
  publishedReferences: z.int().nonnegative(),
});
export type MediaUsageDestination = z.infer<typeof mediaUsageDestinationSchema>;
export type MediaUsageQuery = z.infer<typeof mediaUsageQuerySchema>;
export type MediaUsagePage = z.infer<typeof mediaUsagePageSchema>;
export type MediaUsageAccess = {
  albums: boolean;
  website: boolean;
  events: boolean;
  projects: boolean;
  directory: boolean;
};
