"use client";
import { useState } from "react";
import { ActionsMenu } from "@/ui/actions-menu";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import { useResource, request, errorMessage } from "@/ui/api";
import type { CalendarRecord } from "../calendar_schemas";
import type {
  CalendarImportPreview,
  CalendarSourceSummary,
  CalendarSourcesWorkspace,
} from "../calendar_source_schemas";
import { CalendarImportDialog, ImportPreview } from "./calendar-import-dialog";

function ReviewImport({
  source,
  onClose,
  onSaved,
}: {
  source: CalendarSourceSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error } = useResource<
    CalendarImportPreview & { version: number }
  >("/api/admin/calendar/sources/" + source.id + "/review");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function publish() {
    if (!data) return;
    setBusy(true);
    try {
      await request("/api/admin/calendar/sources/action", {
        method: "POST",
        body: JSON.stringify({
          operation: "publish",
          id: source.id,
          expectedVersion: data.version,
        }),
      });
      onSaved();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={"Review " + source.name}
      onClose={onClose}
      canClose={() => !busy}
    >
      {(error || message) && <Notice>{error || message}</Notice>}
      {data && (
        <>
          <ImportPreview preview={data} />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed this import for this calendar’s audience.
          </label>
          <footer className="dialog-actions">
            <button className="button button-outline" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button button-accent"
              disabled={!confirmed || busy}
              onClick={() => void publish()}
            >
              Publish imported activities
            </button>
          </footer>
        </>
      )}
    </Dialog>
  );
}
export function CalendarSources({ calendar }: { calendar: CalendarRecord }) {
  const { data, error, refresh } = useResource<CalendarSourcesWorkspace>(
    "/api/admin/calendar/sources",
  );
  const [creating, setCreating] = useState(false);
  const [review, setReview] = useState<CalendarSourceSummary | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(source: CalendarSourceSummary, operation: string) {
    if (
      operation === "remove" &&
      !confirm(
        "Remove this import and its published activities? Manually created schedules are kept. You can import the original file again.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await request("/api/admin/calendar/sources/action", {
        method: "POST",
        body: JSON.stringify({
          id: source.id,
          expectedVersion: source.version,
          operation,
        }),
      });
      refresh();
      setMessage(
        operation === "refresh"
          ? "Feed refreshed. Review any pending changes before publication."
          : "Import updated.",
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const items =
    data?.items.filter((item) => item.calendarId === calendar.id) ?? [];
  return (
    <section aria-label="Calendar imports and sync">
      <header className="calendar-row-heading">
        <div>
          <h2>Imports & sync</h2>
          <p>
            Bring in an .ics file or follow a calendar feed. Connections refresh
            hourly while their authorized staff session remains current.
          </p>
        </div>
        <button
          className="button button-accent"
          disabled={!data || calendar.archived}
          onClick={() => setCreating(true)}
        >
          Import or connect
        </button>
      </header>
      {(error || message) && <Notice kind="info">{error || message}</Notice>}
      {!items.length && (
        <div className="panel calendar-empty">
          <h3>Bring your calendars together</h3>
          <p>
            Import from Google Calendar, Outlook, Apple Calendar or another tool
            using its .ics export or subscription feed. Refreshing a source
            never overwrites manual schedules.
          </p>
        </div>
      )}
      <ul className="calendar-admin-list">
        {items.map((source) => (
          <li className="panel" key={source.id}>
            <div>
              <h3>{source.name}</h3>
              <p>
                {source.connected
                  ? "Connected to " + source.host
                  : "Imported file"}{" "}
                ·{" "}
                {source.enabled
                  ? source.changed
                    ? "Changes to review"
                    : source.published
                      ? "Published"
                      : "Draft"
                  : "Paused"}
              </p>
              {source.connected && (
                <small>
                  {source.automatic
                    ? "Automatic publication after first review"
                    : "Review updates before publishing"}
                  {source.checkedAt
                    ? " · Last refreshed " +
                      new Date(source.checkedAt).toLocaleString()
                    : ""}
                </small>
              )}
              {source.error && <Notice>{source.error}</Notice>}
            </div>
            <div className="calendar-actions">
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => setReview(source)}
              >
                Review import
              </button>
              {source.connected && data?.connectionAllowed && (
                <button
                  className="button button-outline"
                  disabled={busy || !source.enabled || !data.remoteEnabled}
                  onClick={() => void action(source, "refresh")}
                >
                  Refresh now
                </button>
              )}
              <ActionsMenu
                label={"Import actions for " + source.name}
                disabled={busy}
              >
                {source.enabled && (
                  <button onClick={() => void action(source, "pause")}>
                    Pause and hide import
                  </button>
                )}
                <button onClick={() => void action(source, "resume")}>
                  {source.connected ? "Resume sync" : "Resume import"}
                </button>
                <button onClick={() => void action(source, "remove")}>
                  Remove import
                </button>
              </ActionsMenu>
            </div>
          </li>
        ))}
      </ul>
      {creating && data && (
        <CalendarImportDialog
          calendar={calendar}
          sources={data}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
            setMessage("Import draft saved. Review and publish it when ready.");
          }}
        />
      )}
      {review && (
        <ReviewImport
          source={review}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            refresh();
            setMessage(
              "Imported activities published. They appear wherever this calendar is published.",
            );
          }}
        />
      )}
    </section>
  );
}
