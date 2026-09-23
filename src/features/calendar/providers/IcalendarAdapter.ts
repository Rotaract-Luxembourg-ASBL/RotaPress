import "server-only";
import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { Temporal } from "@js-temporal/polyfill";
import { isSafeLink } from "@/core/safe-link";
import {
  zoneSchema,
  type CalendarRange,
  type Occurrence,
} from "../calendar_schemas";
import type { CalendarImportAdapter } from "./CalendarImportAdapter";

const rejected = () =>
  new Error(
    "Use a valid iCalendar file of up to 512 KB, with at most 250 events and daily or less frequent repeats.",
  );
function component(document: string) {
  if (
    Buffer.byteLength(document) > 524288 ||
    document.split(/\r?\n/).some((line) => line.length > 16384)
  )
    throw rejected();
  const root = new ICAL.Component(ICAL.parse(document));
  if (
    root.name !== "vcalendar" ||
    root.getAllSubcomponents("vevent").length > 250 ||
    !root.getAllSubcomponents("vevent").length
  )
    throw rejected();
  return root;
}
function zoneFor(event: ICAL.Event, fallback: string) {
  const parameter = event.component
    .getFirstProperty("dtstart")
    ?.getParameter("tzid");
  return zoneSchema.parse(
    event.startDate.zone.tzid === "UTC"
      ? "UTC"
      : typeof parameter === "string"
        ? parameter
        : fallback,
  );
}
function zoned(time: ICAL.Time, zone: string) {
  return Temporal.PlainDateTime.from({
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.isDate ? 0 : time.hour,
    minute: time.isDate ? 0 : time.minute,
    second: time.isDate ? 0 : time.second,
  }).toZonedDateTime(zone, { disambiguation: "compatible" });
}
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";
export class IcalendarAdapter implements CalendarImportAdapter {
  readonly key = "ical";
  readonly label = "iCalendar (.ics)";
  normalize(document: string, timezone: string) {
    zoneSchema.parse(timezone);
    const root = component(document);
    const identities = new Set<string>();
    for (const child of root.getAllSubcomponents("vevent")) {
      const event = new ICAL.Event(child);
      if (
        !event.uid ||
        event.uid.length > 500 ||
        event.startDate.year < 1980 ||
        event.startDate.year > 2120
      )
        throw rejected();
      zoneFor(event, timezone);
      const key =
        event.uid +
        ":" +
        (child.getFirstPropertyValue("recurrence-id")?.toString() ?? "series");
      if (identities.has(key))
        throw new Error(
          "The file contains duplicate event identities. Export a complete, deduplicated calendar.",
        );
      identities.add(key);
      for (const property of child.getAllProperties("rrule")) {
        const rule = property.getFirstValue();
        if (
          !(rule instanceof ICAL.Recur) ||
          !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.freq) ||
          Object.keys(rule.parts).some((p) =>
            ["BYSECOND", "BYMINUTE", "BYHOUR"].includes(p),
          )
        )
          throw rejected();
      }
    }
    // Keep only schedule fields. Participants, organizer addresses, alarms and attachments are never imported.
    const allowed = new Set([
      "uid",
      "dtstart",
      "dtend",
      "duration",
      "summary",
      "description",
      "location",
      "url",
      "status",
      "rrule",
      "rdate",
      "exdate",
      "recurrence-id",
    ]);
    for (const child of [...root.getAllSubcomponents()]) {
      if (child.name !== "vevent") {
        root.removeSubcomponent(child);
        continue;
      }
      for (const property of [...child.getAllProperties()])
        if (!allowed.has(property.name)) child.removeProperty(property);
      for (const nested of [...child.getAllSubcomponents()])
        child.removeSubcomponent(nested);
    }
    for (const property of [...root.getAllProperties()])
      if (!["version", "prodid", "calscale"].includes(property.name))
        root.removeProperty(property);
    return root.toString();
  }
  occurrences(
    document: string,
    timezone: string,
    sourceId: string,
    calendarId: string,
    range: CalendarRange,
  ) {
    const root = component(document);
    const from = Temporal.PlainDate.from(range.from).toZonedDateTime(
      range.timezone,
    ).epochMilliseconds;
    const to = Temporal.PlainDate.from(range.to).toZonedDateTime(
      range.timezone,
    ).epochMilliseconds;
    const result: Occurrence[] = [];
    let iterations = 0;
    for (const child of root.getAllSubcomponents("vevent")) {
      if (child.hasProperty("recurrence-id")) continue;
      const event = new ICAL.Event(child);
      const lastException = Math.max(
        0,
        ...Object.values(event.exceptions).map(
          (exception) =>
            zoned(
              exception.recurrenceId,
              exception.recurrenceId.zone.tzid === "UTC"
                ? "UTC"
                : zoneFor(event, timezone),
            ).epochMilliseconds,
        ),
      );
      const iterator = event.iterator();
      for (
        let occurrence = iterator.next();
        occurrence;
        occurrence = iterator.next()
      ) {
        if (++iterations > 20000 || result.length >= 2000)
          throw new Error(
            "This feed has too many occurrences. Choose a smaller source calendar.",
          );
        const detail = event.getOccurrenceDetails(occurrence);
        const zone = zoneFor(detail.item, timezone);
        const start = zoned(detail.startDate, zone);
        const original = zoned(occurrence, zoneFor(event, timezone));
        // A moved occurrence must not hide later dates or an exception moved into this window.
        if (
          (occurrence.isDate
            ? original.toPlainDate().toString() >= range.to
            : original.epochMilliseconds >= to) &&
          (detail.startDate.isDate
            ? start.toPlainDate().toString() >= range.to
            : start.epochMilliseconds >= to) &&
          original.epochMilliseconds >= lastException
        )
          break;
        let end = zoned(detail.endDate, zone);
        if (end.epochMilliseconds <= start.epochMilliseconds)
          end = start.add(detail.startDate.isDate ? { days: 1 } : { hours: 1 });
        if (
          detail.startDate.isDate
            ? end.toPlainDate().toString() <= range.from ||
              start.toPlainDate().toString() >= range.to
            : end.epochMilliseconds <= from || start.epochMilliseconds >= to
        )
          continue;
        const key = createHash("sha256")
          .update(event.uid + ":" + occurrence.toString())
          .digest("hex")
          .slice(0, 32);
        const url = text(
          detail.item.component.getFirstPropertyValue("url"),
          2000,
        );
        result.push({
          id: sourceId + ":" + key,
          source: "schedule",
          sourceId,
          calendarIds: [calendarId],
          title: text(detail.item.summary, 160) || "Untitled activity",
          description: text(detail.item.description, 4000),
          location: text(detail.item.location, 200),
          url: isSafeLink(url) ? url : "",
          startsAt: start.toInstant().toString(),
          endsAt: end.toInstant().toString(),
          date: start.toPlainDate().toString(),
          endDate: end.toPlainDate().toString(),
          allDay: detail.startDate.isDate,
          timezone: zone,
          cancelled:
            detail.item.component.getFirstPropertyValue("status") ===
            "CANCELLED",
        });
      }
    }
    return result;
  }
}
