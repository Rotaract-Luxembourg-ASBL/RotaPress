"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/ui/dialog";
import { TimeZonePicker } from "@/ui/time-zone-picker";
import { Notice } from "@/ui/primitives";
import { request, errorMessage } from "@/ui/api";
import { dateInZone } from "./calendar-view";
import type {
  CalendarRecord,
  ScheduleDefinition,
  ScheduleRecord,
} from "../calendar_schemas";

export function ScheduleDialog({
  calendar,
  current,
  onClose,
  onSaved,
}: {
  calendar: CalendarRecord;
  current?: ScheduleRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<ScheduleDefinition>(
    current?.draft ?? {
      title: "",
      description: "",
      location: "",
      url: "",
      date: dateInZone(new Date().toISOString(), calendar.draft.timezone),
      time: "18:00",
      timezone: calendar.draft.timezone,
      durationMinutes: 60,
      allDay: false,
      days: 1,
      repeat: "once",
      interval: 1,
      weekdays: [
        new Date(
          dateInZone(new Date().toISOString(), calendar.draft.timezone) +
            "T12:00Z",
        ).getUTCDay() || 7,
      ],
      until: "",
      skippedDates: [],
      cancelled: false,
    },
  );
  const [skip, setSkip] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function set<K extends keyof ScheduleDefinition>(
    key: K,
    next: ScheduleDefinition[K],
  ) {
    setDirty(true);
    setValue({ ...value, [key]: next });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/api/admin/calendar/schedules", {
        method: "POST",
        body: JSON.stringify({
          operation: "save",
          calendarId: calendar.id,
          id: current?.id,
          expectedVersion: current?.version ?? 0,
          definition: value,
        }),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function canClose() {
    return !busy && (!dirty || confirm("Discard this unsaved activity?"));
  }
  return (
    <Dialog
      title={current ? "Edit activity" : "Add an activity"}
      onClose={onClose}
      canClose={canClose}
    >
      <form onSubmit={submit} className="calendar-form">
        <ol className="calendar-steps">
          {["Details", "Date & repeat", "Review"].map((label, index) => (
            <li key={label} aria-current={step === index ? "step" : undefined}>
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        {error && <Notice>{error}</Notice>}
        <fieldset disabled={busy} className="calendar-fields">
          {step === 0 && (
            <>
              <label>
                Activity title
                <input
                  required
                  maxLength={160}
                  value={value.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={value.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </label>
              <label>
                Location
                <input
                  maxLength={200}
                  value={value.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="A venue or an online meeting"
                />
              </label>
              <label>
                More information link
                <input
                  maxLength={2000}
                  value={value.url}
                  onChange={(e) => set("url", e.target.value)}
                  placeholder="https://… or /pages/en/…"
                />
              </label>
              {current && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={value.cancelled}
                    onChange={(e) => set("cancelled", e.target.checked)}
                  />
                  Mark this activity as cancelled after publishing
                </label>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <div className="calendar-field-pair">
                <label>
                  First date
                  <input
                    required
                    type="date"
                    value={value.date}
                    onChange={(e) => set("date", e.target.value)}
                  />
                </label>
                <TimeZonePicker
                  label="Time zone"
                  value={value.timezone}
                  onChange={(zone) => set("timezone", zone)}
                />
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={value.allDay}
                  onChange={(e) => set("allDay", e.target.checked)}
                />
                All-day activity
              </label>
              {value.allDay ? (
                <label>
                  Number of days
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={value.days}
                    onChange={(e) => set("days", Number(e.target.value))}
                  />
                </label>
              ) : (
                <div className="calendar-field-pair">
                  <label>
                    Start time
                    <input
                      required
                      type="time"
                      value={value.time}
                      onChange={(e) => set("time", e.target.value)}
                    />
                  </label>
                  <label>
                    Duration (minutes)
                    <input
                      required
                      type="number"
                      min={5}
                      max={10080}
                      value={value.durationMinutes}
                      onChange={(e) =>
                        set("durationMinutes", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
              )}
              <label>
                Repeat
                <select
                  value={value.repeat}
                  onChange={(e) =>
                    set(
                      "repeat",
                      e.target.value as ScheduleDefinition["repeat"],
                    )
                  }
                >
                  <option value="once">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly, on the same date</option>
                </select>
              </label>
              {value.repeat !== "once" && (
                <>
                  <div className="calendar-field-pair">
                    <label>
                      Repeat every
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={value.interval}
                        onChange={(e) =>
                          set("interval", Number(e.target.value))
                        }
                      />
                      <small>
                        {value.repeat === "daily"
                          ? "days"
                          : value.repeat === "weekly"
                            ? "weeks"
                            : "months"}
                      </small>
                    </label>
                    <label>
                      Repeat until (optional)
                      <input
                        type="date"
                        min={value.date}
                        value={value.until}
                        onChange={(e) => set("until", e.target.value)}
                      />
                      <small>Leave empty for an ongoing schedule.</small>
                    </label>
                  </div>
                  {value.repeat === "weekly" && (
                    <fieldset className="calendar-weekday-picker">
                      <legend>Days of the week</legend>
                      {[
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                        "Sunday",
                      ].map((label, index) => (
                        <label className="checkbox-label" key={label}>
                          <input
                            type="checkbox"
                            checked={value.weekdays.includes(index + 1)}
                            onChange={(e) =>
                              set(
                                "weekdays",
                                e.target.checked
                                  ? [...value.weekdays, index + 1]
                                  : value.weekdays.filter(
                                      (day) => day !== index + 1,
                                    ),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <fieldset>
                    <legend>Dates to skip</legend>
                    <div className="calendar-actions">
                      <input
                        aria-label="Date to skip"
                        type="date"
                        value={skip}
                        onChange={(e) => setSkip(e.target.value)}
                      />
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={!skip || value.skippedDates.length >= 100}
                        onClick={() => {
                          set(
                            "skippedDates",
                            [...new Set([...value.skippedDates, skip])].sort(),
                          );
                          setSkip("");
                        }}
                      >
                        Skip date
                      </button>
                    </div>
                    {value.skippedDates.map((date) => (
                      <button
                        type="button"
                        className="calendar-skip"
                        key={date}
                        onClick={() =>
                          set(
                            "skippedDates",
                            value.skippedDates.filter((d) => d !== date),
                          )
                        }
                        aria-label={"Restore occurrence on " + date}
                      >
                        {date} ×
                      </button>
                    ))}
                  </fieldset>
                </>
              )}
              <p className="field-help">
                Repeats keep the local start time when daylight saving changes.
                A missing clock time moves forward; a repeated clock time uses
                its first occurrence. Monthly dates missing from a month are
                skipped.
              </p>
            </>
          )}
          {step === 2 && (
            <div className="calendar-review">
              <p className="eyebrow">{calendar.draft.name}</p>
              <h3>{value.title}</h3>
              <p>{value.description}</p>
              <dl>
                <dt>Starts</dt>
                <dd>
                  {value.date} · {value.allDay ? "All day" : value.time} ·{" "}
                  {value.timezone}
                </dd>
                <dt>Repeats</dt>
                <dd>
                  {value.repeat === "once"
                    ? "One activity"
                    : "Every " +
                      value.interval +
                      " " +
                      { daily: "day", weekly: "week", monthly: "month" }[
                        value.repeat
                      ] +
                      (value.interval === 1 ? "" : "s")}
                  {value.until ? " until " + value.until : ""}
                </dd>
                <dt>Who can see it after publication?</dt>
                <dd>
                  {(calendar.published ?? calendar.draft).audience === "members"
                    ? "Approved members"
                    : "Everyone, including guests"}
                </dd>
                <dt>Location</dt>
                <dd>{value.location || "Not specified"}</dd>
              </dl>
              {value.cancelled && (
                <Notice>
                  This activity will be marked cancelled when you publish the
                  draft.
                </Notice>
              )}
              <p>
                Save a private draft now. Publication is a separate action from
                the schedule list.
              </p>
            </div>
          )}
          <footer className="dialog-actions">
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => {
                if (canClose()) onClose();
              }}
            >
              Cancel
            </button>
            {step > 0 && (
              <button
                type="button"
                className="button button-outline"
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
            )}
            <button
              className="button button-accent"
              type="submit"
              disabled={
                busy || (value.repeat === "weekly" && !value.weekdays.length)
              }
            >
              {busy
                ? "Saving…"
                : step === 2
                  ? "Save activity draft"
                  : "Continue"}
            </button>
          </footer>
        </fieldset>
      </form>
    </Dialog>
  );
}
