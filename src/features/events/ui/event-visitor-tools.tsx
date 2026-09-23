"use client";
import { useEffect, useState } from "react";
import type { EventFields } from "../event_schemas";

export function EventCountdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    const initial = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initial);
    };
  }, []);
  if (now === null) return null;
  const seconds = Math.max(
    0,
    Math.floor((new Date(startsAt).getTime() - now) / 1000),
  );
  if (!seconds) return null;
  const values = [
    Math.floor(seconds / 86400),
    Math.floor(seconds / 3600) % 24,
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ];
  return (
    <div className="event-countdown" aria-label="Time until the event">
      {["Days", "Hours", "Minutes", "Seconds"].map((label, index) => (
        <div key={label}>
          <strong>{String(values[index]).padStart(2, "0")}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function EventCalendarButton({
  event,
  disabled,
}: {
  event: EventFields;
  disabled?: boolean;
}) {
  function download() {
    const escape = (text: string) =>
      text
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/[,;]/g, "\\$&");
    const format = (value: string) =>
      new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//RotaPress//Events//EN",
      "BEGIN:VEVENT",
      `UID:${format(event.startsAt)}-${encodeURIComponent(event.title)}@rotapress`,
      `DTSTAMP:${format(new Date().toISOString())}`,
      `DTSTART:${format(event.startsAt)}`,
      ...(event.endsAt ? [`DTEND:${format(event.endsAt)}`] : []),
      `SUMMARY:${escape(event.title)}`,
      `LOCATION:${escape(event.venue)}`,
      `DESCRIPTION:${escape(event.description)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "event.ics";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={download}
      className="event-calendar-button"
    >
      Add to calendar
    </button>
  );
}
