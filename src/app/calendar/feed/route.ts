import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { services } from "@/composition/services";
import { handle, HttpError } from "@/core/http";
import { config } from "@/core/config";
import { calendarIcal } from "@/features/calendar/calendar_ical";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => {
    await services.limiter.consume("calendar-feed", "public", 120);
    const query = new URL(request.url).searchParams;
    const ids = z
      .array(z.uuid())
      .max(30)
      .parse(query.get("calendars")?.split(",").filter(Boolean) ?? []);
    // Feeds never use cookies or private tokens. Member calendars stay on the signed-in website.
    const sources = await services.calendar.reader.sources(null, ids);
    const today = Temporal.Now.plainDateISO("UTC");
    const feed = services.calendar.reader.project(sources, {
      from: today.subtract({ days: 7 }).toString(),
      to: today.add({ days: 90 }).toString(),
      calendarIds: ids,
      timezone: "UTC",
    });
    if (feed.truncated)
      throw new HttpError(
        422,
        "This feed contains too many activities. Subscribe to individual calendars instead.",
      );
    return new Response(calendarIcal(feed.occurrences, config.APP_URL), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=community-calendar.ics",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
