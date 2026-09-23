import type { Occurrence } from "./calendar_schemas";
const escapeText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r/g, "");
function fold(line: string) {
  const parts = [];
  let part = "";
  let size = 0;
  for (const character of line) {
    const bytes = new TextEncoder().encode(character).length;
    if (size + bytes > 75) {
      parts.push(part);
      part = " ";
      size = 1;
    }
    part += character;
    size += bytes;
  }
  return [...parts, part].join("\r\n");
}
const stamp = (value: string) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
/** Stable occurrence UIDs, UTC times, exclusive all-day ends and UTF-8 line folding. */
export function calendarIcal(
  items: Occurrence[],
  origin: string,
  now = new Date(),
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RotaPress//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Community calendar",
  ];
  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + escapeText(item.id) + "@rotapress",
      "DTSTAMP:" + stamp(now.toISOString()),
      ...(item.allDay
        ? [
            "DTSTART;VALUE=DATE:" + item.date.replace(/-/g, ""),
            "DTEND;VALUE=DATE:" + item.endDate.replace(/-/g, ""),
          ]
        : ["DTSTART:" + stamp(item.startsAt), "DTEND:" + stamp(item.endsAt)]),
      "SUMMARY:" + escapeText(item.title),
      "DESCRIPTION:" + escapeText(item.description),
      "LOCATION:" + escapeText(item.location),
      "STATUS:" + (item.cancelled ? "CANCELLED" : "CONFIRMED"),
    );
    if (item.url)
      lines.push(
        "URL:" + new URL(item.url, origin).href.replace(/[\r\n]/g, ""),
      );
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
