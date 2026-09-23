"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { EntryRecord, EntryWorkspace } from "../entry_schemas";
import { NewEntryDialog, ReviewEntryDialog } from "./event-entry-dialog";

export function EventEntriesPanel({
  eventId,
  active,
  disabled,
  onDirtyChange,
}: {
  eventId: string;
  active: boolean;
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { data, error, refresh } = useResource<EntryWorkspace>(
    active ? `/api/admin/events/${eventId}/entries` : null,
  );
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"new" | EntryRecord | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!active || dialog) return;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active, dialog, refresh]);
  const entries = data?.entries ?? [];
  const visible = entries.filter(
    (entry) =>
      (filter === "all" || entry.state === filter) &&
      `${entry.label} ${entry.reference}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const quantity = (state: EntryRecord["state"]) =>
    entries
      .filter((entry) => entry.state === state)
      .reduce((total, entry) => total + entry.quantity, 0);
  const close = () => {
    setDialog(null);
    onDirtyChange(false);
  };
  const saved = () => {
    close();
    setMessage(
      dialog === "new"
        ? "Demonstration entries added."
        : "Decision saved. Earlier decisions are retained in the history.",
    );
    refresh();
  };
  return (
    <section className="event-entries" aria-label="Entries and review">
      <header className="entry-heading">
        <div>
          <p className="eyebrow">Demonstration only</p>
          <h3>Entries &amp; review</h3>
          <p>
            Practice assigning entries and reviewing payment changes before a
            draw.
          </p>
        </div>
        {data?.canManage && (
          <button
            className="button button-accent"
            disabled={disabled}
            onClick={() => {
              setMessage("");
              setDialog("new");
            }}
          >
            Add demonstration entries
          </button>
        )}
      </header>
      <p className="entry-demo-note">
        Real paid entries and prize awards are disabled. Each count is chosen by
        a manager; purchases never create entries automatically.
      </p>
      {error && (
        <Notice>
          {error}{" "}
          <button type="button" className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {message && <Notice kind="success">{message}</Notice>}
      {data?.unavailableReason && (
        <Notice kind="info">
          {data.unavailableReason}{" "}
          <Link
            className="text-link"
            href={`/admin/events/${eventId}?tab=features`}
          >
            View event features
          </Link>
        </Notice>
      )}
      {data && (
        <>
          <dl className="entry-totals">
            <div>
              <dt>Ready for demonstration</dt>
              <dd>{quantity("ready")}</dd>
            </div>
            <div>
              <dt>Entries on hold</dt>
              <dd>{quantity("held")}</dd>
            </div>
            <div>
              <dt>Voided entries</dt>
              <dd>{quantity("void")}</dd>
            </div>
          </dl>
          <div className="entry-library">
            <div className="entry-filters">
              <label>
                Search entries
                <input
                  type="search"
                  placeholder="Participant or reference"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                Show
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All participants</option>
                  <option value="held">On hold</option>
                  <option value="ready">Ready for demonstration</option>
                  <option value="void">Voided</option>
                </select>
              </label>
              <button className="button button-outline" onClick={refresh}>
                Refresh entries
              </button>
            </div>
            {!entries.length ? (
              <div className="entry-empty">
                <h4>No entries yet</h4>
                <p>
                  Add a test participant to try the workflow. You can also use a
                  saved test purchase to check how refund holds work.
                </p>
              </div>
            ) : !visible.length ? (
              <div className="entry-empty">
                <p>No entries match your search.</p>
                <button
                  className="inline-button"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="entry-list">
                {visible.map((entry) => (
                  <li key={entry.id}>
                    <div className="entry-person">
                      <strong>{entry.label}</strong>
                      <span>
                        {entry.reference} ·{" "}
                        {entry.source === "manual"
                          ? "Test participant"
                          : "Test purchase"}
                      </span>
                      {entry.holdReason && entry.state === "held" && (
                        <p>{entry.holdReason}</p>
                      )}
                    </div>
                    <div className="entry-count">
                      <strong>{entry.quantity}</strong>
                      <span>entries</span>
                    </div>
                    <span className={`entry-state entry-state-${entry.state}`}>
                      {entry.state === "ready"
                        ? "Ready for demo"
                        : entry.state === "held"
                          ? "On hold"
                          : "Voided"}
                    </span>
                    <button
                      className="button button-outline"
                      onClick={() => {
                        setMessage("");
                        setDialog(entry);
                      }}
                      disabled={disabled}
                      aria-label={`${entry.state === "void" || !data.canManage ? "View history for" : "Review entries for"} ${entry.label}`}
                    >
                      {entry.state === "void" || !data.canManage
                        ? "View history"
                        : "Review"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      {dialog === "new" && (
        <NewEntryDialog
          eventId={eventId}
          onClose={close}
          onSaved={saved}
          onDirtyChange={onDirtyChange}
        />
      )}
      {dialog && dialog !== "new" && (
        <ReviewEntryDialog
          eventId={eventId}
          entry={dialog}
          canManage={Boolean(data?.canManage)}
          onClose={close}
          onSaved={saved}
          onDirtyChange={onDirtyChange}
        />
      )}
    </section>
  );
}
