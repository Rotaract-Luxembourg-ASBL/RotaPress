import { services } from "@/composition/services";
import { CalendarView } from "@/features/calendar/ui/calendar-view";
export async function CalendarPublicBlock({
  title,
  calendarIds,
  view,
  timezone,
}: {
  title: string;
  calendarIds: string[];
  view: "month" | "week" | "agenda";
  timezone: string;
}) {
  if (!(await services.authorization.features.installed()).calendar)
    return null;
  return (
    <section className="cms-block cms-calendar">
      <h2>{title}</h2>
      <CalendarView
        calendarIds={calendarIds}
        initialView={view}
        timezone={timezone}
        compact
      />
    </section>
  );
}
