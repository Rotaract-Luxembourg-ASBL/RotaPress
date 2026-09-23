"use client";

import type { EventFields as Fields } from "../event_schemas";

function localValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function instant(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}
export function EventFields({
  value,
  onChange,
  section = "all",
}: {
  value: Fields;
  onChange: (value: Fields) => void;
  section?: "all" | "basics" | "schedule";
}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function set<K extends keyof Fields>(key: K, text: Fields[K]) {
    onChange({ ...value, [key]: text });
  }
  return (
    <>
      {section !== "schedule" && (
        <>
          <label className="event-field-wide">
            Event name
            <input
              required
              minLength={2}
              maxLength={160}
              value={value.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label className="event-field-wide">
            Description
            <textarea
              rows={4}
              maxLength={5000}
              value={value.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
        </>
      )}
      {section !== "basics" && (
        <>
          <div className="form-columns event-field-wide">
            <label>
              Start time
              <input
                type="datetime-local"
                required
                value={localValue(value.startsAt)}
                onChange={(e) => set("startsAt", instant(e.target.value))}
              />
            </label>
            <label>
              End time (optional)
              <input
                type="datetime-local"
                value={localValue(value.endsAt)}
                onChange={(e) => set("endsAt", instant(e.target.value) || null)}
              />
            </label>
          </div>
          <p className="field-help event-field-wide">
            Enter times in your device's time zone: {zone}. Saved schedules are
            displayed in the event's time zone.
          </p>
          <label>
            Event time zone
            <input
              required
              maxLength={100}
              value={value.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              placeholder="Europe/Luxembourg"
            />
          </label>
          <label>
            Venue
            <input
              maxLength={300}
              value={value.venue}
              onChange={(e) => set("venue", e.target.value)}
            />
          </label>
        </>
      )}
      {section !== "schedule" && (
        <>
          <label className="event-field-wide">
            Visibility when published
            <select
              value={value.visibility}
              onChange={(e) =>
                set("visibility", e.target.value as Fields["visibility"])
              }
            >
              <option value="private">Private — authorized people only</option>
              <option value="unlisted">Unlisted — accessible by link</option>
              <option value="public">Public — listed on the website</option>
            </select>
          </label>
          <p className="field-help event-field-wide">
            All drafts are private. This preference does not publish the event.
          </p>
        </>
      )}
    </>
  );
}
