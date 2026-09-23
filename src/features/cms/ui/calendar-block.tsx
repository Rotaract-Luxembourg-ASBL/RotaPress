"use client";
import type { ComponentConfig } from "@puckeditor/core";
import Link from "next/link";
import { useResource } from "@/ui/api";
import { TimeZonePicker } from "@/ui/time-zone-picker";
import { CalendarView } from "@/features/calendar/ui/calendar-view";
import { useCurrentUser } from "@/ui/admin-shell";
import { useRefreshOnFocus } from "./event-editor-scope";
type Props = {
  version: 1;
  title: string;
  calendarIds: string[];
  view: "month" | "week" | "agenda";
  timezone: string;
};
function CalendarPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { features, capabilities } = useCurrentUser();
  const { data, error, refresh } = useResource<{
    items: { id: string; name: string; audience: string }[];
  }>(features.calendar ? "/api/calendar/catalogue" : null);
  useRefreshOnFocus(refresh);
  if (!features.calendar)
    return (
      <p className="field-help">
        Calendar is disabled in Integrations. Your selection is kept.
      </p>
    );
  return (
    <fieldset className="calendar-choice-list" disabled={disabled}>
      <legend>Calendars to include</legend>
      <p className="field-help">
        Leave unchecked to include every calendar the visitor may see. Member
        calendars remain protected.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading published calendars…</p>}
      {data?.items.length === 0 && (
        <p className="field-help">
          No published calendars yet. Create a calendar and publish its audience
          and activities in Calendar.
        </p>
      )}
      {data?.items.map((c) => (
        <label className="checkbox-label" key={c.id}>
          <input
            type="checkbox"
            checked={value.includes(c.id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, c.id]
                  : value.filter((id) => id !== c.id),
              )
            }
          />
          {c.name}
          {c.audience === "members" ? " (members)" : ""}
        </label>
      ))}
      {data &&
        value
          .filter((id) => !data?.items.some((c) => c.id === id))
          .map((id) => (
            <label className="checkbox-label" key={id}>
              <input
                type="checkbox"
                checked
                onChange={() => onChange(value.filter((entry) => entry !== id))}
              />
              Unavailable selection — remove from block
            </label>
          ))}
      {capabilities.includes("calendar.manage") && (
        <Link className="text-link" href="/admin/calendar" target="_blank">
          Manage calendars ↗
        </Link>
      )}
    </fieldset>
  );
}
export const calendarBlockConfig: ComponentConfig<Props> = {
  label: "Calendar",
  fields: {
    version: { type: "custom", visible: false, render: () => <></> },
    title: { type: "text", label: "Heading" },
    calendarIds: {
      type: "custom",
      label: "Calendars",
      render: ({ value, onChange, readOnly }) => (
        <CalendarPicker value={value} onChange={onChange} disabled={readOnly} />
      ),
    },
    view: {
      type: "select",
      label: "Starting view",
      options: [
        { label: "Month", value: "month" },
        { label: "Week", value: "week" },
        { label: "Agenda", value: "agenda" },
      ],
    },
    timezone: {
      type: "custom",
      label: "Display time zone",
      render: ({ value, onChange, readOnly }) => (
        <fieldset disabled={readOnly} className="editor-fieldset">
          <TimeZonePicker
            label="Display time zone"
            value={value}
            onChange={onChange}
          />
        </fieldset>
      ),
    },
  },
  defaultProps: {
    version: 1,
    title: "What’s coming up",
    calendarIds: [],
    view: "month",
    timezone: "Europe/Luxembourg",
  },
  render: ({ title, calendarIds, view, timezone }) => (
    <section className="cms-block cms-calendar">
      <h2>{title}</h2>
      <CalendarView
        key={view + timezone}
        calendarIds={calendarIds}
        initialView={view}
        timezone={timezone}
        compact
      />
    </section>
  ),
};
