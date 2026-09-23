"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/ui/dialog";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { EventDraft, ManagerOption } from "../event_schemas";

export function EventManagerDialog({
  event,
  onClose,
  onSaved,
}: {
  event: EventDraft;
  onClose: () => void;
  onSaved: (value: EventDraft) => void;
}) {
  const { data, error: loadError } = useResource<{ managers: ManagerOption[] }>(
    "/api/admin/events/managers",
  );
  const [userId, setUserId] = useState(event.manager?.userId ?? "");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const candidate = data?.managers.find((person) => person.userId === userId);
  async function submit(submission: FormEvent) {
    submission.preventDefault();
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const saved = await request<EventDraft>(
        `/api/admin/events/${event.id}/manager`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: event.version,
            managerUserId: userId,
            confirmed: true,
          }),
        },
      );
      onSaved(saved);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Change event manager"
      onClose={onClose}
      canClose={() => !busy}
    >
      {loadError ? (
        <Notice>{loadError}</Notice>
      ) : !data ? (
        <Loading />
      ) : (
        <form className="form-stack" onSubmit={submit} aria-busy={busy}>
          <p>
            Assign responsibility for <strong>{event.title}</strong>. Only club
            owners and administrators can change this assignment.
          </p>
          {error && <Notice>{error}</Notice>}
          {reviewing ? (
            <div className="notice notice-info">
              <p>
                Replace{" "}
                <strong>{event.manager?.name ?? "Unavailable manager"}</strong>{" "}
                with <strong>{candidate?.name}</strong>.
              </p>
              <p>
                The previous manager loses access to this event unless they also
                have club-wide event authority. The new manager gains access
                only to this event. Club roles and event features stay
                unchanged.
              </p>
            </div>
          ) : (
            <label>
              New responsible manager
              <select
                value={userId}
                disabled={busy}
                onChange={(change) => setUserId(change.target.value)}
                required
              >
                <option value="">Choose an approved member</option>
                {data.managers.map((person) => (
                  <option value={person.userId} key={person.userId}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="field-help">
            Recent sign-in is required. No content or saved configuration is
            copied or deleted.
          </p>
          <div className="cms-actions">
            <button
              className="button button-accent"
              disabled={busy || !candidate || userId === event.manager?.userId}
            >
              {busy
                ? "Saving…"
                : reviewing
                  ? "Confirm manager change"
                  : "Review manager change"}
            </button>
            {reviewing && (
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={() => setReviewing(false)}
              >
                Back
              </button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}
