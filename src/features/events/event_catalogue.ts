import { z } from "zod";
import { cmsLocaleSchema } from "../cms/cms_schemas";

export const eventPeriodSchema = z.enum([
  "upcoming",
  "past",
  "all",
  "featured",
]);
export const eventCatalogueQuery = z.object({
  locale: cmsLocaleSchema.default("en"),
  period: eventPeriodSchema.default("upcoming"),
  limit: z.coerce.number().int().min(1).max(24).default(6),
});
export type PublicEventCard = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  venue: string;
  cancelled: boolean;
  href: string;
  imageId: string | null;
  featured?: boolean;
};

/** Receives public projections only. Ongoing events remain in Upcoming. */
export function selectPublishedEvents<T extends PublicEventCard>(
  events: T[],
  period: z.infer<typeof eventPeriodSchema>,
  limit = events.length,
  now = Date.now(),
): T[] {
  return events
    .filter((event) => {
      if (period === "featured")
        return event.featured === true && !event.cancelled;
      const ended = new Date(event.endsAt ?? event.startsAt).getTime() < now;
      return period === "all" || (period === "past" ? ended : !ended);
    })
    .sort((a, b) => {
      const order =
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      return period === "past" ? -order : order;
    })
    .slice(0, limit);
}
