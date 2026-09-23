"use client";
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useResource, request, errorMessage } from "@/ui/api";
import { ActionsMenu } from "@/ui/actions-menu";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import type {
  CalendarRecord,
  CalendarWorkspace,
  ScheduleRecord,
} from "../calendar_schemas";
import { CalendarDialog } from "./calendar-dialogs";
import { timeZoneLabel } from "@/ui/time-zone-picker";
import { ScheduleDialog } from "./schedule-dialog";
import { CalendarView } from "./calendar-view";
import { CalendarPageDesign } from "./calendar-page-design";
import { CalendarSources } from "./calendar-sources";
import { ScopedEmailTemplates } from "@/integrations/email/ui/scoped-email-templates";

import { SummaryStats } from "@/ui/collection";
import { Icon } from "@/ui/icon";
import { CalendarActivityList } from "./calendar-activity-list";

export function CalendarPanel() {
  const query = useSearchParams();
  const { data, error, refresh } = useResource<CalendarWorkspace>(
    "/api/admin/calendar",
  );
  const [tab, setTab] = useState("schedules");
  const [pageDirty, setPageDirty] = useState(false);
  const [calendarDialog, setCalendarDialog] = useState<
    CalendarRecord | "new" | null
  >(null);
  const [scheduleDialog, setScheduleDialog] = useState<
    ScheduleRecord | "new" | null
  >(null);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = data?.calendars.find((c) => c.id === query.get("calendar"));
  function select(id: string | null) {
    if (
      pageDirty &&
      !confirm("Discard unsaved changes before choosing another calendar?")
    )
      return;
    setPageDirty(false);
    const url = new URL(location.href);
    if (id) url.searchParams.set("calendar", id);
    else url.searchParams.delete("calendar");
    history.replaceState(null, "", url);
    setMessage("");
    setActionError("");
  }
  async function action(
    kind: "calendar" | "schedule",
    record: CalendarRecord | ScheduleRecord,
    operation: string,
  ) {
    if (
      ["archive", "unpublish"].includes(operation) &&
      !confirm(
        (operation === "archive" ? "Archive" : "Unpublish") +
          " this " +
          kind +
          "? It will disappear from calendar views. Saved content is retained.",
      )
    )
      return;
    if (
      operation === "publish" &&
      !confirm(
        "Publish the saved " +
          kind +
          " draft for this calendar’s audience? Calendar settings and each schedule have their own publication.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    setActionError("");
    try {
      await request(
        "/api/admin/calendar" + (kind === "schedule" ? "/schedules" : ""),
        {
          method: "POST",
          body: JSON.stringify({
            operation,
            id: record.id,
            expectedVersion: record.version,
            ...(kind === "schedule" && "calendarId" in record
              ? { calendarId: record.calendarId }
              : {}),
          }),
        },
      );
      refresh();
      setMessage(
        operation === "publish"
          ? "Published. Calendar views now use this saved version."
          : "Updated. Saved content is retained.",
      );
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data && !error) return <Loading />;
  return (
    <div className="calendar-admin">
      <PageHeading
        title="Calendars"
        description="Group activities, manage your calendars and bring everything together in one view."
      >
        <div className="admin-actions">
          <Link className="button button-outline" href="/calendar">
            Open calendar <Icon name="external" />
          </Link>
          <button
            className="button button-accent"
            onClick={() => setCalendarDialog("new")}
          >
            <Icon name="plus" />
            New calendar
          </button>
        </div>
      </PageHeading>
      {(error || actionError || message) && (
        <Notice kind={error || actionError ? "error" : "success"}>
          {error || actionError || message}
          {error && (
            <button className="inline-button" onClick={refresh}>
              Try again
            </button>
          )}
        </Notice>
      )}
      {data && (
        <>
          <nav
            className="admin-workspace-tabs"
            aria-label="Calendar administration"
          >
            {[
              ["schedules", "Calendars & activities"],
              ["preview", "Combined calendar"],
              ["page", "Page design"],
              ["emails", "Emails"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {
                  if (
                    id === tab ||
                    (pageDirty &&
                      !confirm("Leave without saving your changes?"))
                  )
                    return;
                  setPageDirty(false);
                  setTab(id);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "schedules" && (
            <SummaryStats
              label="Calendar counts"
              items={[
                {
                  label: "Active calendars",
                  value: data.calendars.filter((item) => !item.archived).length,
                  hint: "All calendars you manage",
                  icon: "calendar",
                },
                {
                  label: "Published calendars",
                  value: data.calendars.filter(
                    (item) => !item.archived && item.published,
                  ).length,
                  hint: "For their selected audiences",
                  icon: "check",
                },
                {
                  label: "Active activities",
                  value: data.schedules.filter((item) => !item.archived).length,
                  hint: "Repeating schedules count once",
                  icon: "calendar",
                },
                {
                  label: "Activity drafts",
                  value: data.schedules.filter(
                    (item) => !item.archived && !item.published,
                  ).length,
                  hint: "Not published yet",
                  icon: "edit",
                },
              ]}
            />
          )}
          {tab === "emails" ? (
            <>
              <label className="email-template-picker">
                Calendar to customize
                <select
                  value={chosen?.id ?? ""}
                  onChange={(event) => select(event.target.value || null)}
                >
                  <option value="">Choose a calendar</option>
                  {data.calendars.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.draft.name}
                      {c.archived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {chosen ? (
                <ScopedEmailTemplates
                  key={chosen.id}
                  target={{ kind: "calendar", id: chosen.id }}
                  onDirtyChange={setPageDirty}
                />
              ) : (
                <div className="panel calendar-empty">
                  <h2>Emails for each calendar</h2>
                  <p>
                    Choose a calendar to customize its updates and reminders.
                    Calendars use the shared email templates by default.
                  </p>
                </div>
              )}
            </>
          ) : tab === "page" ? (
            <CalendarPageDesign
              workspace={data}
              refresh={refresh}
              onDirtyChange={setPageDirty}
            />
          ) : tab === "preview" ? (
            <>
              <p className="field-help">
                This is the published view for your account. Unpublished
                activities stay private.
              </p>
              <CalendarView timezone={data.page.draft.timezone} />
            </>
          ) : (
            <div className="calendar-admin-columns">
              <aside className="calendar-library admin-section-nav">
                <h2>Your calendars</h2>
                <button
                  className={!chosen ? "is-selected" : ""}
                  aria-pressed={!chosen}
                  onClick={() => select(null)}
                >
                  All activities
                </button>
                {data.calendars.map((c) => (
                  <button
                    key={c.id}
                    className={chosen?.id === c.id ? "is-selected" : ""}
                    aria-pressed={chosen?.id === c.id}
                    onClick={() => select(c.id)}
                    style={
                      { "--calendar-color": c.draft.color } as CSSProperties
                    }
                  >
                    <span className="calendar-dot" />
                    <span>
                      <strong>{c.draft.name}</strong>
                      <small>
                        {c.archived
                          ? "Archived"
                          : !c.published
                            ? "Draft"
                            : c.published.audience === "members"
                              ? "Members"
                              : "Public"}
                      </small>
                    </span>
                  </button>
                ))}
                {!data.calendars.length && (
                  <p>
                    Create your first calendar, such as Community life or Member
                    meetings.
                  </p>
                )}
              </aside>
              <section
                className="calendar-schedule-workspace"
                aria-label="Calendar activities"
              >
                {chosen && (
                  <header
                    className="calendar-selected-header"
                    style={
                      {
                        "--calendar-color": chosen.draft.color,
                      } as CSSProperties
                    }
                  >
                    <div>
                      <p className="eyebrow">
                        {chosen.archived
                          ? "Archived calendar"
                          : chosen.published
                            ? "Published calendar"
                            : "Private calendar draft"}
                      </p>
                      <h2>{chosen.draft.name}</h2>
                      <p>{chosen.draft.description}</p>
                      <div className="calendar-selected-meta">
                        <span>
                          {chosen.draft.audience === "members"
                            ? "For approved members"
                            : "For everyone"}
                        </span>
                        <span>
                          New activities: {timeZoneLabel(chosen.draft.timezone)}
                        </span>
                        {chosen.published &&
                          JSON.stringify(chosen.draft) !==
                            JSON.stringify(chosen.published) && (
                            <strong>Saved changes · not published yet</strong>
                          )}
                      </div>
                    </div>
                    <div className="calendar-actions">
                      {!chosen.archived && (
                        <>
                          <button
                            className="button button-outline"
                            onClick={() => setCalendarDialog(chosen)}
                          >
                            Edit calendar
                          </button>
                          {JSON.stringify(chosen.draft) !==
                            JSON.stringify(chosen.published) && (
                            <button
                              className="button button-accent"
                              disabled={busy}
                              onClick={() =>
                                void action("calendar", chosen, "publish")
                              }
                            >
                              Publish calendar
                            </button>
                          )}
                        </>
                      )}
                      <ActionsMenu label="Calendar actions" disabled={busy}>
                        {chosen.archived ? (
                          <button
                            onClick={() =>
                              void action("calendar", chosen, "restore")
                            }
                          >
                            Restore calendar
                          </button>
                        ) : (
                          <>
                            {chosen.published && (
                              <button
                                onClick={() =>
                                  void action("calendar", chosen, "unpublish")
                                }
                              >
                                Unpublish calendar
                              </button>
                            )}
                            <button
                              onClick={() =>
                                void action("calendar", chosen, "archive")
                              }
                            >
                              Archive calendar
                            </button>
                          </>
                        )}
                      </ActionsMenu>
                    </div>
                  </header>
                )}
                <div className="calendar-row-heading">
                  <div>
                    <h2>{chosen ? "Activities" : "All activities"}</h2>
                    <p>
                      {chosen && !chosen.published
                        ? "Publish this calendar when ready. Only published activities will be visible."
                        : "Draft edits stay private until you publish them."}
                    </p>
                  </div>
                  {chosen && !chosen.archived && (
                    <button
                      className="button button-accent"
                      onClick={() => setScheduleDialog("new")}
                    >
                      Add activity
                    </button>
                  )}
                </div>
                <CalendarActivityList
                  key={chosen?.id ?? "all"}
                  workspace={data}
                  calendar={chosen}
                  busy={busy}
                  onEdit={(record) => {
                    select(record.calendarId);
                    setScheduleDialog(record);
                  }}
                  onAction={(record, operation) =>
                    void action("schedule", record, operation)
                  }
                />
                {chosen && !chosen.archived && (
                  <CalendarSources key={chosen.id} calendar={chosen} />
                )}
              </section>
            </div>
          )}
          {calendarDialog && (
            <CalendarDialog
              current={calendarDialog === "new" ? undefined : calendarDialog}
              events={data.events}
              onClose={() => setCalendarDialog(null)}
              onSaved={(id) => {
                setCalendarDialog(null);
                select(id);
                refresh();
                setMessage("Calendar draft saved. Publish it when ready.");
              }}
            />
          )}
          {scheduleDialog && chosen && (
            <ScheduleDialog
              calendar={chosen}
              current={scheduleDialog === "new" ? undefined : scheduleDialog}
              onClose={() => setScheduleDialog(null)}
              onSaved={() => {
                setScheduleDialog(null);
                refresh();
                setMessage("Activity draft saved. Publish it when ready.");
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
