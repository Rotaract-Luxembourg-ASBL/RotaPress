"use client";
import { TimeZonePicker } from "@/ui/time-zone-picker";
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useResource } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Loading, Notice } from "@/ui/primitives";
import type {
  CalendarFeed,
  CalendarPageDefinition,
  Occurrence,
} from "../calendar_schemas";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const moveDay = (value: string, days: number) =>
  isoDate(new Date(new Date(value + "T12:00:00Z").getTime() + days * 86400000));
function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}
export function dateInZone(instant: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: validZone(zone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return get("year") + "-" + get("month") + "-" + get("day");
}
export function CalendarView({
  calendarIds = [],
  initialView = "month",
  timezone = "Europe/Luxembourg",
  compact = false,
  initialDate,
  subscriptionsHref = "/calendar?tab=subscriptions",
}: {
  calendarIds?: string[];
  initialView?: CalendarPageDefinition["view"];
  timezone?: string;
  compact?: boolean;
  initialDate?: string;
  subscriptionsHref?: string;
}) {
  const [anchor, setAnchor] = useState(() =>
    initialDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(initialDate) &&
    Number.isFinite(Date.parse(initialDate + "T12:00:00Z")) &&
    new Date(initialDate + "T12:00:00Z").toISOString().slice(0, 10) ===
      initialDate
      ? initialDate
      : dateInZone(new Date().toISOString(), timezone),
  );
  const [view, setView] = useState(initialView);
  const [zone, setZone] = useState(() => validZone(timezone));
  const [selected, setSelected] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Occurrence | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const first = anchor.slice(0, 7) + "-01";
  const weekStart = (date: string) =>
    moveDay(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
  const start = view === "week" ? weekStart(anchor) : weekStart(first);
  const days = Array.from({ length: view === "week" ? 7 : 42 }, (_, i) =>
    moveDay(start, i),
  );
  const query = new URLSearchParams({
    from: start,
    to: moveDay(start, days.length),
    calendars: calendarIds.join(","),
    timezone: zone,
  });
  const { data, error, refresh } = useResource<CalendarFeed>(
    "/api/calendar?" + query,
  );
  const chosen = selected ?? data?.calendars.map((c) => c.id) ?? [];
  const items =
    data?.occurrences.filter(
      (o) =>
        o.calendarIds.some((id) => chosen.includes(id)) &&
        (o.title + " " + o.description + " " + o.location)
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  function onDate(item: Occurrence, date: string) {
    const begins = item.allDay ? item.date : dateInZone(item.startsAt, zone);
    const ends = item.allDay
      ? moveDay(item.endDate, -1)
      : dateInZone(
          new Date(new Date(item.endsAt).getTime() - 1).toISOString(),
          zone,
        );
    return date >= begins && date <= ends;
  }
  function shownDate(item: Occurrence) {
    return item.allDay ? item.date : dateInZone(item.startsAt, zone);
  }
  const agendaDays =
    view === "week"
      ? days
      : days.filter((date) => date.slice(0, 7) === anchor.slice(0, 7));
  const agendaItems = items.filter((item) =>
    agendaDays.some((date) => onDate(item, date)),
  );
  const today = dateInZone(new Date().toISOString(), zone);
  function navigate(direction: number) {
    if (view === "week") setAnchor(moveDay(anchor, direction * 7));
    else {
      const date = new Date(first + "T12:00:00Z");
      date.setUTCMonth(date.getUTCMonth() + direction);
      setAnchor(isoDate(date));
    }
  }
  function calendarNames(item: Occurrence) {
    return data?.calendars
      .filter((c) => item.calendarIds.includes(c.id))
      .map((c) => c.name)
      .join(" · ");
  }
  function color(item: Occurrence) {
    return {
      "--calendar-color":
        data?.calendars.find((c) => item.calendarIds.includes(c.id))?.color ??
        "#25636b",
    } as CSSProperties;
  }
  const time = (item: Occurrence) =>
    item.allDay
      ? "All day"
      : new Intl.DateTimeFormat("en", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(item.startsAt));
  function agenda(values: Occurrence[]) {
    return values.length ? (
      <ol className="calendar-agenda">
        {values.map((item) => (
          <li key={item.id} style={color(item)}>
            <span className="calendar-date-tile">
              <strong>{Number(shownDate(item).slice(-2))}</strong>
              <small>
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(shownDate(item) + "T12:00Z"))}
              </small>
            </span>
            <button
              className="calendar-agenda-item"
              type="button"
              onClick={() => setDetail(item)}
            >
              <span className="calendar-meta">
                {time(item)} · {calendarNames(item)}
              </span>
              <strong>{item.title}</strong>
              <span>
                {item.cancelled ? "Cancelled" : item.location || "View details"}
              </span>
            </button>
            {item.source === "event" && <span className="badge">Event</span>}
          </li>
        ))}
      </ol>
    ) : (
      <div className="calendar-empty">
        <h3>A little room in the calendar</h3>
        <p>No activities match these dates and filters.</p>
      </div>
    );
  }
  return (
    <section
      className={"calendar-view" + (compact ? " calendar-compact" : "")}
      aria-label="Community calendar"
    >
      <div className="calendar-toolbar">
        <div className="calendar-period">
          <button
            className="button button-outline"
            onClick={() => navigate(-1)}
            aria-label="Previous period"
          >
            ←
          </button>
          <h2>
            {new Intl.DateTimeFormat("en", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(anchor + "T12:00Z"))}
          </h2>
          <button
            className="button button-outline"
            onClick={() => navigate(1)}
            aria-label="Next period"
          >
            →
          </button>
          <button
            className="button button-outline"
            onClick={() => setAnchor(today)}
          >
            Today
          </button>
        </div>
        <div className="calendar-view-switch" aria-label="Calendar layout">
          {(["month", "week", "agenda"] as const).map((v) => (
            <button
              type="button"
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar-tools">
        <label>
          Find an activity
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, place or description"
          />
        </label>
        <TimeZonePicker
          label="Display time zone"
          value={zone}
          onChange={setZone}
        />
      </div>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {data && (
        <>
          <fieldset className="calendar-filters">
            <legend>Calendars to show</legend>
            {data.calendars.map((c) => (
              <label
                key={c.id}
                style={{ "--calendar-color": c.color } as CSSProperties}
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(c.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...chosen, c.id]
                        : chosen.filter((id) => id !== c.id),
                    )
                  }
                />
                <span className="calendar-dot" />
                {c.name}
                {c.audience === "members" && <small>Members</small>}
              </label>
            ))}
            {!data.calendars.length && (
              <p>
                No calendars are available yet. Member calendars appear after
                sign-in and membership approval.
              </p>
            )}
          </fieldset>
          {data.truncated && (
            <Notice>
              There are more activities than this view can show. Select fewer
              calendars or use the week view.
            </Notice>
          )}
          {view === "agenda" ? (
            agenda(agendaItems)
          ) : (
            <>
              <div
                className="calendar-grid"
                aria-label={view === "week" ? "Week view" : "Month view"}
              >
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (label) => (
                    <div key={label} className="calendar-weekday">
                      {label}
                    </div>
                  ),
                )}
                {days.map((date) => {
                  const values = items.filter((item) => onDate(item, date));
                  return (
                    <div
                      key={date}
                      className={
                        "calendar-cell" +
                        (date === today ? " is-today" : "") +
                        (date.slice(0, 7) !== anchor.slice(0, 7)
                          ? " is-outside"
                          : "")
                      }
                    >
                      <button
                        className="calendar-day"
                        type="button"
                        aria-label={date + ", " + values.length + " activities"}
                        onClick={() => setDay(date)}
                      >
                        {Number(date.slice(-2))}
                      </button>
                      <div className="calendar-cell-items">
                        {values.slice(0, 3).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            style={color(item)}
                            onClick={() => setDetail(item)}
                            className={
                              "calendar-chip" +
                              (item.cancelled ? " is-cancelled" : "")
                            }
                          >
                            <span>{time(item)}</span>
                            <strong>{item.title}</strong>
                          </button>
                        ))}
                        {values.length > 3 && (
                          <button
                            className="inline-button"
                            onClick={() => setDay(date)}
                          >
                            +{values.length - 3} more
                          </button>
                        )}
                      </div>
                      {values.length > 0 && (
                        <button
                          className="calendar-mobile-count"
                          aria-label={values.length + " activities on " + date}
                          onClick={() => setDay(date)}
                        >
                          {values.length}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="calendar-mobile-agenda">
                {agenda(agendaItems)}
              </div>
            </>
          )}
          <footer className="calendar-view-footer">
            <span>Times shown in {zone}. Colors identify calendars.</span>
            <Link className="text-link" href={subscriptionsHref}>
              Notifications & subscriptions
            </Link>
            <a
              className="text-link"
              href={
                "/calendar/feed" +
                (calendarIds.length
                  ? "?calendars=" + calendarIds.join(",")
                  : "")
              }
            >
              Public calendar feed (.ics)
            </a>
          </footer>
        </>
      )}
      {day && !detail && (
        <Dialog
          title={new Date(day + "T12:00Z").toLocaleDateString("en", {
            dateStyle: "full",
            timeZone: "UTC",
          })}
          onClose={() => setDay(null)}
        >
          {agenda(items.filter((item) => onDate(item, day)))}
        </Dialog>
      )}
      {detail && (
        <Dialog title={detail.title} onClose={() => setDetail(null)}>
          <div className="calendar-detail">
            <p className="calendar-meta">
              {calendarNames(detail)}
              {detail.cancelled ? " · Cancelled" : ""}
            </p>
            <p>
              {new Date(
                detail.allDay ? detail.date + "T12:00Z" : detail.startsAt,
              ).toLocaleString("en", {
                dateStyle: "full",
                ...(detail.allDay ? {} : { timeStyle: "short" as const }),
                timeZone: detail.allDay ? "UTC" : zone,
              })}
              {detail.allDay
                ? " · All day"
                : " — " +
                  new Date(detail.endsAt).toLocaleString("en", {
                    ...(shownDate(detail) !== dateInZone(detail.endsAt, zone)
                      ? { dateStyle: "medium" as const }
                      : {}),
                    timeStyle: "short",
                    timeZone: zone,
                  })}
            </p>
            {detail.allDay && moveDay(detail.endDate, -1) !== detail.date && (
              <p>
                Through{" "}
                {new Date(
                  moveDay(detail.endDate, -1) + "T12:00Z",
                ).toLocaleDateString("en", {
                  dateStyle: "long",
                  timeZone: "UTC",
                })}
              </p>
            )}
            <p>{detail.location}</p>
            <p className="calendar-description">{detail.description}</p>
            {detail.url && (
              <a className="button button-accent" href={detail.url}>
                {detail.source === "event" ? "Open event" : "More information"}
              </a>
            )}
            <p className="field-help">
              Original schedule time zone: {detail.timezone}
            </p>
          </div>
        </Dialog>
      )}
    </section>
  );
}
