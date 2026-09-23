"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import { TimeZonePicker, timeZoneLabel } from "@/ui/time-zone-picker";
import { request, errorMessage } from "@/ui/api";
import {
  calendarColors,
  calendarDefinitionSchema,
  type CalendarDefinition,
  type CalendarRecord,
  type CalendarWorkspace,
} from "../calendar_schemas";

const sections = ["Details", "Audience & time", "Connected events"];
const colorNames = [
  "Teal",
  "Terracotta",
  "Purple",
  "Blue",
  "Pink",
  "Olive",
  "Gold",
  "Slate",
];

export function CalendarDialog({
  current,
  events,
  onClose,
  onSaved,
}: {
  current?: CalendarRecord;
  events: CalendarWorkspace["events"];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [value, setValue] = useState<CalendarDefinition>(
    current?.draft ?? {
      name: "",
      description: "",
      color: calendarColors[0],
      audience: "public",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      eventSource: "none",
      eventIds: [],
    },
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function set<K extends keyof CalendarDefinition>(
    key: K,
    next: CalendarDefinition[K],
  ) {
    setDirty(true);
    setValue((before) => ({ ...before, [key]: next }));
  }
  function close() {
    if (!busy && (!dirty || confirm("Discard these unsaved calendar changes?")))
      onClose();
  }
  function changeStep(next: number) {
    if (next > step && !form.current?.reportValidity()) return;
    setStep(next);
    setError("");
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!current && step < 2) return changeStep(step + 1);
    const parsed = calendarDefinitionSchema.safeParse(value);
    if (!parsed.success) {
      setError(
        "Check the calendar name and choose a valid time zone before saving.",
      );
      setStep(parsed.error.issues[0]?.path[0] === "timezone" ? 1 : 0);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request<{ id: string }>("/api/admin/calendar", {
        method: "POST",
        body: JSON.stringify({
          operation: "save",
          id: current?.id,
          expectedVersion: current?.version ?? 0,
          definition: parsed.data,
        }),
      });
      onSaved(result.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={current ? "Edit calendar" : "Create a calendar"}
      onClose={close}
      canClose={() => !busy}
    >
      <form
        ref={form}
        onSubmit={save}
        className="calendar-form calendar-editor"
      >
        <p className="calendar-editor-intro">
          {current
            ? "Edit the saved draft. Publish your changes when you are ready to share them."
            : "A calendar groups related activities, such as volunteering or member meetings. Start with a private draft."}
        </p>
        <nav
          className="calendar-editor-tabs"
          aria-label="Calendar setup sections"
        >
          {sections.map((label, index) => (
            <button
              key={label}
              type="button"
              disabled={busy || (!current && index > step + 1)}
              aria-current={step === index ? "step" : undefined}
              onClick={() => changeStep(index)}
            >
              <span aria-hidden="true">{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        {error && <Notice>{error}</Notice>}
        <fieldset disabled={busy} className="calendar-fields">
          <section
            aria-labelledby={`${id}-heading`}
            className="calendar-editor-section"
          >
            <h3 id={`${id}-heading`} tabIndex={-1} ref={heading}>
              {sections[step]}
            </h3>
            {step === 0 && (
              <>
                <label>
                  Calendar name
                  <input
                    required
                    maxLength={100}
                    value={value.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="For example, Member meetings"
                  />
                </label>
                <label>
                  Description{" "}
                  <span className="field-help">
                    Optional · help people understand what belongs here.
                  </span>
                  <textarea
                    aria-label="Description"
                    maxLength={1000}
                    rows={3}
                    value={value.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </label>
                <fieldset className="calendar-color-picker">
                  <legend>Color in the combined calendar</legend>
                  {calendarColors.map((color, index) => (
                    <label
                      key={color}
                      title={colorNames[index]}
                      style={{ backgroundColor: color }}
                    >
                      <input
                        type="radio"
                        name={`${id}-color`}
                        aria-label={colorNames[index]}
                        checked={value.color === color}
                        onChange={() => set("color", color)}
                      />
                      <span aria-hidden="true">
                        {value.color === color ? "✓" : ""}
                      </span>
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {step === 1 && (
              <>
                <fieldset className="calendar-audience-options">
                  <legend>Who can see it after publication?</legend>
                  {(
                    [
                      [
                        "public",
                        "Everyone",
                        "Visitors and members can see published activities.",
                      ],
                      [
                        "members",
                        "Approved members",
                        "People must sign in and have an approved membership.",
                      ],
                    ] as const
                  ).map(([key, label, help]) => (
                    <label
                      key={key}
                      className={value.audience === key ? "is-selected" : ""}
                    >
                      <input
                        type="radio"
                        name={`${id}-audience`}
                        value={key}
                        checked={value.audience === key}
                        onChange={() => set("audience", key)}
                      />
                      <span>
                        <strong>{label}</strong>
                        <small>{help}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <TimeZonePicker
                  label="Default time zone"
                  value={value.timezone}
                  onChange={(zone) => set("timezone", zone)}
                  help="New activities start in this time zone. Changing it does not move existing activities. Each activity can use a different zone."
                />
              </>
            )}
            {step === 2 && (
              <>
                <p>
                  Add activities directly to this calendar, or also show events
                  you manage in Events.
                </p>
                <label>
                  Events to include
                  <select
                    value={value.eventSource}
                    onChange={(e) => {
                      const source = e.target
                        .value as CalendarDefinition["eventSource"];
                      setDirty(true);
                      setValue((before) => ({
                        ...before,
                        eventSource: source,
                        eventIds: source === "selected" ? before.eventIds : [],
                      }));
                    }}
                  >
                    <option value="none">
                      None · I will add activities myself
                    </option>
                    <option value="all">
                      All published public events · update automatically
                    </option>
                    <option value="selected">
                      Let me choose specific events
                    </option>
                  </select>
                </label>
                {value.eventSource === "selected" && (
                  <fieldset className="calendar-choice-list">
                    <legend>Choose events</legend>
                    {events.length ? (
                      events.map((event) => (
                        <label className="checkbox-label" key={event.id}>
                          <input
                            type="checkbox"
                            checked={value.eventIds.includes(event.id)}
                            onChange={(e) =>
                              set(
                                "eventIds",
                                e.target.checked
                                  ? [...value.eventIds, event.id]
                                  : value.eventIds.filter(
                                      (item) => item !== event.id,
                                    ),
                              )
                            }
                          />
                          {event.title}
                        </label>
                      ))
                    ) : (
                      <p>
                        No public events are published yet. You can connect them
                        later.
                      </p>
                    )}
                  </fieldset>
                )}
                <p className="field-help">
                  Connected events keep their own dates and publication rules.
                  Private events are never shown.
                </p>
                <div className="calendar-setup-summary">
                  <strong>{value.name || "Your calendar"}</strong>
                  <span>
                    {value.audience === "members"
                      ? "Approved members"
                      : "Everyone"}{" "}
                    · {timeZoneLabel(value.timezone)}
                  </span>
                  <p>
                    {current
                      ? "Save first, then publish the updated calendar. Activities keep their own publication settings."
                      : "Next: add an activity or import a calendar file. Nothing becomes visible until you publish."}
                  </p>
                </div>
              </>
            )}
          </section>
          <footer className="dialog-actions calendar-editor-actions">
            <button
              className="button button-outline"
              type="button"
              onClick={close}
            >
              Cancel
            </button>
            {!current && step > 0 && (
              <button
                className="button button-outline"
                type="button"
                onClick={() => changeStep(step - 1)}
              >
                Back
              </button>
            )}
            <button className="button button-accent" type="submit">
              {busy
                ? "Saving…"
                : current
                  ? "Save changes"
                  : step < 2
                    ? "Continue"
                    : "Create calendar"}
            </button>
          </footer>
        </fieldset>
      </form>
    </Dialog>
  );
}
