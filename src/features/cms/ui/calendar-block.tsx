"use client";
import type { ComponentConfig } from "@puckeditor/core";
import { useResource } from "@/ui/api";
import { TimeZonePicker } from "@/ui/time-zone-picker";
import { CalendarView } from "@/features/calendar/ui/calendar-view";
import { useCurrentUser } from "@/ui/admin-shell";
import { useRefreshOnFocus } from "./event-editor-scope";
import { ConnectedSource, ConnectionError } from "./connected-source";
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
  const missing = data
    ? value.filter((id) => !data.items.some((c) => c.id === id))
    : [];
  return (
    <div className="editor-connection-picker editor-calendar-picker">
      <ConnectedSource
        name="Calendar"
        icon="calendar"
        enabled={features.calendar}
        status={
          error
            ? "Connection unavailable"
            : !data
              ? "Loading calendars…"
              : value.length
                ? `${value.length} selected calendar${value.length === 1 ? "" : "s"}`
                : "All available calendars"
        }
        tone={error || missing.length ? "attention" : "neutral"}
        description="This block follows published calendars and activities. Each visitor sees only the calendars their audience allows; member calendars stay protected."
        href={
          capabilities.includes("calendar.manage")
            ? "/admin/calendar"
            : undefined
        }
        action="Open Calendar"
        onRefresh={refresh}
      />
      {features.calendar && (
        <>
          {error && <ConnectionError error={error} onRetry={refresh} />}
          <fieldset
            className="calendar-choice-list"
            disabled={disabled || !data}
          >
            <legend>Calendars to include</legend>
            <p className="field-help">
              Leave unchecked to include all available calendars.
            </p>
            {data?.items.map((calendar) => (
              <label className="checkbox-label" key={calendar.id}>
                <input
                  type="checkbox"
                  checked={value.includes(calendar.id)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...value, calendar.id]
                        : value.filter((id) => id !== calendar.id),
                    )
                  }
                />
                {calendar.name}
                {calendar.audience === "members" ? " (members)" : ""}
              </label>
            ))}
            {missing.map((id) => (
              <label className="checkbox-label" key={id}>
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    onChange(value.filter((entry) => entry !== id))
                  }
                />
                Unavailable selection — uncheck to remove
              </label>
            ))}
            {data?.items.length === 0 && (
              <p className="field-help">
                No published calendars available. Create and publish one in
                Calendar.
              </p>
            )}
          </fieldset>
          {missing.length > 0 && (
            <p className="editor-connection-selection">
              Some saved selections are unavailable. They stay selected until
              you remove them; review publication and audience in Calendar.
            </p>
          )}
          <p className="field-help">
            Calendar feeds and imports are configured in Calendar. Choosing a
            calendar here does not create or change a provider connection.
          </p>
        </>
      )}
    </div>
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
