import { Temporal } from "@js-temporal/polyfill";
import type {
  CalendarRange,
  Occurrence,
  ScheduleDefinition,
} from "./calendar_schemas";

/** Reject invalid dates rather than letting Date silently roll into another month. */
export function validateSchedule(value: ScheduleDefinition): void {
  const start = Temporal.PlainDate.from(value.date);
  if (start.year < 2000 || start.year > 2100)
    throw new Error("Choose a date between 2000 and 2100.");
  if (
    value.until &&
    Temporal.PlainDate.compare(start, Temporal.PlainDate.from(value.until)) > 0
  )
    throw new Error("The repeat end date must follow the first date.");
  for (const date of value.skippedDates) Temporal.PlainDate.from(date);
  // A missing wall time moves forward; an overlapping time uses its first occurrence.
  start
    .toPlainDateTime(value.allDay ? "00:00" : value.time)
    .toZonedDateTime(value.timezone, { disambiguation: "compatible" });
}
export function validateRange(range: CalendarRange, maxDays = 93): void {
  const days = Temporal.PlainDate.from(range.from).until(
    Temporal.PlainDate.from(range.to),
  ).days;
  if (days < 1 || days > maxDays)
    throw new Error("Choose a date range of 1 to " + maxDays + " days.");
}
export function scheduleOccurrences(
  id: string,
  calendarId: string,
  schedule: ScheduleDefinition,
  range: CalendarRange,
): Occurrence[] {
  const start = Temporal.PlainDate.from(schedule.date);
  const end = Temporal.PlainDate.from(range.to).add({ days: 1 });
  const windowStart = Temporal.PlainDate.from(range.from).subtract({ days: 8 });
  let day =
    Temporal.PlainDate.compare(start, windowStart) > 0 ? start : windowStart;
  const fromMs = Temporal.PlainDate.from(range.from).toZonedDateTime(
    range.timezone,
  ).epochMilliseconds;
  const toMs = Temporal.PlainDate.from(range.to).toZonedDateTime(
    range.timezone,
  ).epochMilliseconds;
  const result: Occurrence[] = [];
  const weekAnchor = start.subtract({ days: start.dayOfWeek - 1 });
  for (; Temporal.PlainDate.compare(day, end) < 0; day = day.add({ days: 1 })) {
    const date = day.toString();
    if (schedule.until && date > schedule.until) break;
    const offset = start.until(day).days;
    const weeks = Math.floor(weekAnchor.until(day).days / 7);
    const months = (day.year - start.year) * 12 + day.month - start.month;
    const matches =
      schedule.repeat === "once"
        ? offset === 0
        : schedule.repeat === "daily"
          ? offset % schedule.interval === 0
          : schedule.repeat === "weekly"
            ? weeks % schedule.interval === 0 &&
              schedule.weekdays.includes(day.dayOfWeek)
            : months % schedule.interval === 0 && day.day === start.day;
    if (!matches || schedule.skippedDates.includes(date)) continue;
    const at = day
      .toPlainDateTime(schedule.allDay ? "00:00" : schedule.time)
      .toZonedDateTime(schedule.timezone, { disambiguation: "compatible" });
    const until = schedule.allDay
      ? at.add({ days: schedule.days })
      : at.add({ minutes: schedule.durationMinutes });
    if (
      schedule.allDay
        ? until.toPlainDate().toString() <= range.from || date >= range.to
        : until.epochMilliseconds <= fromMs || at.epochMilliseconds >= toMs
    )
      continue;
    result.push({
      id: id + ":" + date,
      source: "schedule",
      sourceId: id,
      calendarIds: [calendarId],
      title: schedule.title,
      description: schedule.description,
      location: schedule.location,
      url: schedule.url,
      startsAt: at.toInstant().toString(),
      endsAt: until.toInstant().toString(),
      date,
      endDate: until.toPlainDate().toString(),
      timezone: schedule.timezone,
      allDay: schedule.allDay,
      cancelled: schedule.cancelled,
    });
  }
  return result;
}
