"use client";
import { useState } from "react";
import type { EventDraft } from "../event_schemas";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import { request, errorMessage } from "@/ui/api";

type Review = {
  expectedVersion: number;
  expectedConfirmed: number;
  cancelled: boolean;
  externalAuthority: boolean;
};
export function EventCancellationPanel({
  event,
  disabled,
  onSaved,
  compact = false,
}: {
  event: EventDraft;
  disabled: boolean;
  onSaved: (value: EventDraft) => void;
  compact?: boolean;
}) {
  const [review, setReview] = useState<Review>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (event.cancelled)
    return (
      <Notice kind="info">
        This event is cancelled. Its published pages show a cancellation notice,
        new participation is closed and confirmed bookings were cancelled.
        Content and response history are retained. Archive it to remove public
        access.
      </Notice>
    );
  if (event.archived || !event.capabilities.includes("events.cancel"))
    return null;
  async function load() {
    setBusy(true);
    setError(undefined);
    setConfirmed(false);
    try {
      setReview(
        await request<Review>(`/api/admin/events/${event.id}/cancellation`),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!review || !confirmed) return;
    setBusy(true);
    setError(undefined);
    try {
      const next = await request<EventDraft>(
        `/api/admin/events/${event.id}/cancellation`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: review.expectedVersion,
            expectedConfirmed: review.expectedConfirmed,
            confirmed: true,
          }),
        },
      );
      setReview(undefined);
      onSaved(next);
    } catch (cause) {
      setError(errorMessage(cause));
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={compact ? "event-cancellation-action" : "panel form-stack"}
      aria-label="Event cancellation"
      aria-busy={busy}
    >
      {!compact && (
        <div>
          <h2>Cancel this event</h2>
          <p>
            Close participation while keeping the event's content and private
            records.
          </p>
        </div>
      )}
      {!review && error && <Notice>{error}</Notice>}
      <div>
        <button
          className="button button-outline event-action-trigger"
          disabled={disabled || busy}
          onClick={() => void load()}
        >
          Review event cancellation
        </button>
      </div>
      {review && (
        <Dialog
          title="Review event cancellation"
          onClose={() => setReview(undefined)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              Cancel <strong>{event.title}</strong> and its{" "}
              <strong>
                {review.expectedConfirmed} confirmed{" "}
                {review.expectedConfirmed === 1
                  ? "registration"
                  : "registrations"}
              </strong>
              .
            </p>
            <p>
              Forms and registration close immediately. Published pages show a
              cancellation notice. Event content, responses, media and team
              permissions are preserved. Pending event notifications stop.
            </p>
            <p>
              No participant emails or refunds are sent. Contact participants
              separately. Cancellation cannot be undone; a future event can
              start from a reviewed draft copy.
            </p>
            {review.externalAuthority && (
              <Notice kind="info">
                This closes the link on RotaPress only. Cancel the provider
                event, registrations and any refunds separately in Luma.
              </Notice>
            )}
            {error && (
              <Notice>
                {error}{" "}
                <button
                  className="inline-button"
                  disabled={busy}
                  onClick={() => void load()}
                >
                  Refresh cancellation review
                </button>
              </Notice>
            )}
            <label className="forms-check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm the event and listed registrations should be cancelled.
            </label>
            <button
              className="button button-accent"
              disabled={busy || !confirmed}
              onClick={() => void cancel()}
            >
              Confirm event cancellation
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
