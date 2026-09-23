"use client";
import { TimeZonePicker } from "@/ui/time-zone-picker";
import { useEffect, useState } from "react";
import Link from "next/link";
import { request, errorMessage } from "@/ui/api";
import { Notice } from "@/ui/primitives";
import type { CalendarWorkspace } from "../calendar_schemas";
import { CalendarView } from "./calendar-view";
export function CalendarPageDesign({
  workspace,
  refresh,
  onDirtyChange,
}: {
  workspace: CalendarWorkspace;
  refresh: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [value, setValue] = useState(workspace.page.draft);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => onDirtyChange(dirty || busy), [dirty, busy, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(operation: "save" | "publish") {
    setBusy(true);
    setMessage("");
    try {
      await request("/api/admin/calendar/page", {
        method: "POST",
        body: JSON.stringify({
          operation,
          expectedVersion: workspace.page.version,
          ...(operation === "save" ? { definition: value } : {}),
        }),
      });
      setDirty(false);
      refresh();
      setMessage(
        operation === "save"
          ? "Page draft saved. The public page is unchanged."
          : "Calendar page published.",
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Calendar page design" className="calendar-page-design">
      <div className="panel">
        <h2>Design /calendar</h2>
        <p>
          Choose the welcome text, starting view and calendars. Member-only
          content still requires approved membership.
        </p>
        <p className="field-help">
          To place a calendar on another page, open{" "}
          <Link className="text-link" href="/admin/website" target="_blank">
            Website → Pages
          </Link>{" "}
          and add a Calendar block.
        </p>
        {message && <Notice kind="info">{message}</Notice>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save("save");
          }}
        >
          <fieldset
            disabled={busy}
            className="calendar-fields"
            onChange={() => setDirty(true)}
          >
            <label>
              Page title
              <input
                required
                maxLength={120}
                value={value.title}
                onChange={(e) => setValue({ ...value, title: e.target.value })}
              />
            </label>
            <label>
              Introduction
              <textarea
                maxLength={1200}
                value={value.introduction}
                onChange={(e) =>
                  setValue({ ...value, introduction: e.target.value })
                }
              />
            </label>
            <label>
              Starting view
              <select
                value={value.view}
                onChange={(e) =>
                  setValue({
                    ...value,
                    view: e.target.value as typeof value.view,
                  })
                }
              >
                <option value="month">Month</option>
                <option value="week">Week</option>
                <option value="agenda">Agenda</option>
              </select>
            </label>
            <TimeZonePicker
              label="Display time zone"
              value={value.timezone}
              onChange={(zone) => setValue({ ...value, timezone: zone })}
            />
            <fieldset className="calendar-choice-list">
              <legend>Calendars on this page</legend>
              <p className="field-help">
                Select calendars, or leave all unchecked to include every
                calendar the visitor may see.
              </p>
              {workspace.calendars
                .filter((c) => !c.archived)
                .map((c) => (
                  <label className="checkbox-label" key={c.id}>
                    <input
                      type="checkbox"
                      checked={value.calendarIds.includes(c.id)}
                      onChange={(e) =>
                        setValue({
                          ...value,
                          calendarIds: e.target.checked
                            ? [...value.calendarIds, c.id]
                            : value.calendarIds.filter((id) => id !== c.id),
                        })
                      }
                    />
                    {c.draft.name}
                  </label>
                ))}
            </fieldset>
            <div className="calendar-actions">
              <button className="button button-outline" type="submit">
                Save page draft
              </button>
              <button
                className="button button-accent"
                type="button"
                disabled={dirty || busy}
                onClick={() => void save("publish")}
              >
                Publish page design
              </button>
              <Link className="text-link" href="/calendar" target="_blank">
                Open calendar ↗
              </Link>
            </div>
            {dirty && (
              <p className="field-help">Save your draft before publishing.</p>
            )}
          </fieldset>
        </form>
      </div>
      <div className="calendar-design-preview">
        <p className="eyebrow">Preview with currently published activities</p>
        <h2>{value.title}</h2>
        <p>{value.introduction}</p>
        <CalendarView
          key={value.view + value.timezone}
          calendarIds={value.calendarIds}
          initialView={value.view}
          timezone={value.timezone}
          compact
        />
      </div>
    </section>
  );
}
