"use client";

import { useState } from "react";
import { Dialog } from "@/ui/dialog";
import { errorMessage, request } from "@/ui/api";
import { Notice } from "@/ui/primitives";
import { Icon } from "@/ui/icon";
import type { EventDraft, EventSummary } from "../event_schemas";

/** Event archival retains all records; the current service has no unarchive. */
export function EventArchiveAction({
  event,
  disabled = false,
  onArchived,
}: {
  event: EventSummary;
  disabled?: boolean;
  onArchived: (event: EventDraft) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const next = await request<EventDraft>(
        `/api/admin/events/${event.id}/archive`,
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: event.version }),
        },
      );
      setReviewing(false);
      onArchived(next);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="action-item action-danger event-action-trigger"
        disabled={disabled}
        onClick={() => {
          setError("");
          setReviewing(true);
        }}
      >
        <Icon name="archive" />
        Archive event
      </button>
      {reviewing && (
        <Dialog
          title="Archive event"
          onClose={() => setReviewing(false)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              <strong>{event.title}</strong>
            </p>
            <p>
              This archives the event, removes its public pages and closes
              access to registration. It will leave the active events list.
            </p>
            <p>
              Event content, forms, responses, bookings and guest records stay
              stored for authorized staff. This does not permanently delete
              them.
            </p>
            <p>
              Find the event in Archived to review its records. Archived events
              are read-only and cannot currently be restored.
            </p>
            {error && <Notice>{error}</Notice>}
            <div className="form-actions">
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={() => setReviewing(false)}
              >
                Keep event
              </button>
              <button
                type="button"
                className="button button-accent"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy ? "Archiving…" : "Archive event"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
