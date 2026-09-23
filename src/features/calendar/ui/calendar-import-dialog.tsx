"use client";
import { TimeZonePicker } from "@/ui/time-zone-picker";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import { request, errorMessage } from "@/ui/api";
import type { CalendarRecord } from "../calendar_schemas";
import type {
  CalendarImportPreview,
  CalendarSourcesWorkspace,
} from "../calendar_source_schemas";

export function CalendarImportDialog({
  calendar,
  sources,
  onClose,
  onSaved,
}: {
  calendar: CalendarRecord;
  sources: CalendarSourcesWorkspace;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState("file");
  const [provider, setProvider] = useState(sources.providers[0]?.key ?? "ical");
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [timezone, setTimezone] = useState(calendar.draft.timezone);
  const [automatic, setAutomatic] = useState(false);
  const [preview, setPreview] = useState<CalendarImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function inspect(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<
        CalendarImportPreview & { document?: string }
      >(
        "/api/admin/calendar/sources/" +
          (mode === "file" ? "preview" : "fetch"),
        {
          method: "POST",
          body: JSON.stringify({
            calendarId: calendar.id,
            provider,
            timezone,
            ...(mode === "file" ? { document } : { endpoint }),
          }),
        },
      );
      if (result.document) setDocument(result.document);
      setPreview(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await request("/api/admin/calendar/sources/create", {
        method: "POST",
        body: JSON.stringify({
          id,
          calendarId: calendar.id,
          provider,
          document,
          timezone,
          name,
          expectedDigest: preview.digest,
          ...(mode === "feed" ? { endpoint, automatic } : {}),
        }),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Import or connect a calendar"
      onClose={onClose}
      canClose={() =>
        !busy &&
        ((!name && !document && !endpoint) ||
          confirm("Discard this unsaved import?"))
      }
    >
      <div className="calendar-form">
        {error && <Notice>{error}</Notice>}
        {!preview ? (
          <form onSubmit={inspect}>
            <fieldset disabled={busy} className="calendar-fields">
              <p>
                Import activities into <strong>{calendar.draft.name}</strong>.
                Review them privately before publication. Imported activities
                are managed by their source.
              </p>
              <label>
                Import name
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Community programme"
                />
              </label>
              <label>
                Format
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  {sources.providers.map((p) => (
                    <option value={p.key} key={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Import from
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setDocument("");
                  }}
                >
                  <option value="file">Upload a calendar file</option>
                  {sources.connectionAllowed && (
                    <option value="feed">Connect an HTTPS calendar feed</option>
                  )}
                </select>
              </label>
              {mode === "file" ? (
                <label>
                  Calendar file (.ics, up to 512 KB)
                  <input
                    type="file"
                    accept=".ics,text/calendar"
                    required
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      setError("");
                      if (!file) {
                        setDocument("");
                        return;
                      }
                      if (file.size > 524288) {
                        setError("Choose a calendar file up to 512 KB.");
                        setDocument("");
                        return;
                      }
                      setDocument(await file.text());
                    }}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Private or public feed URL
                    <input
                      type="url"
                      required
                      maxLength={500}
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="https://calendar.example.org/feed.ics"
                      autoComplete="off"
                    />
                  </label>
                  <p className="field-help">
                    Only the hostname will be shown after saving. The full link
                    is encrypted; it may contain a private subscription key.
                  </p>
                  {!sources.remoteEnabled && (
                    <Notice>
                      This installation currently accepts files. Remote feed
                      connections must be enabled by the site operator.
                    </Notice>
                  )}
                </>
              )}
              <TimeZonePicker
                label="Time zone for dates without a zone"
                value={timezone}
                onChange={setTimezone}
              />
              <footer className="dialog-actions">
                <button
                  className="button button-outline"
                  type="button"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className="button button-accent"
                  type="submit"
                  disabled={
                    busy ||
                    (mode === "file" ? !document : !sources.remoteEnabled)
                  }
                >
                  {busy ? "Reading…" : "Review import"}
                </button>
              </footer>
            </fieldset>
          </form>
        ) : (
          <>
            <ImportPreview preview={preview} />
            <p>
              These activities will be saved privately. Publishing the import
              makes them available to this calendar’s audience:{" "}
              <strong>
                {(calendar.published ?? calendar.draft).audience === "members"
                  ? "approved members"
                  : "everyone"}
              </strong>
              .
            </p>
            {!calendar.published && (
              <p>
                Publish the calendar itself before its imported activities can
                appear.
              </p>
            )}
            {mode === "feed" && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={automatic}
                  onChange={(e) => setAutomatic(e.target.checked)}
                />
                After my first publication, automatically publish later feed
                updates. Otherwise keep updates as drafts for review.
              </label>
            )}
            <footer className="dialog-actions">
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="button button-accent"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save import draft"}
              </button>
            </footer>
          </>
        )}
      </div>
    </Dialog>
  );
}
export function ImportPreview({ preview }: { preview: CalendarImportPreview }) {
  return (
    <div className="calendar-import-preview">
      <h3>{preview.count} activities in this preview</h3>
      <p>
        The preview covers the past seven days and next 90 days, showing up to
        12 occurrences. Participant lists, organizer addresses, alarms and
        attachments are excluded.
      </p>
      <ol>
        {preview.items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <span>
              {item.allDay
                ? new Date(item.date + "T12:00Z").toLocaleDateString("en", {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }) + " · All day"
                : new Date(item.startsAt).toLocaleString("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: item.timezone,
                  }) +
                  " · " +
                  item.timezone}
              {item.location ? " · " + item.location : ""}
              {item.cancelled ? " · Cancelled" : ""}
            </span>
          </li>
        ))}
      </ol>
      {!preview.count && (
        <p>
          The import has no activities in this preview period. Its valid dates
          and recurrence are retained.
        </p>
      )}
    </div>
  );
}
