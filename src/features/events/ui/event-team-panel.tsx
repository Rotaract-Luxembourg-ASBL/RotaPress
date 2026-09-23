"use client";

import { useState } from "react";
import { Dialog } from "@/ui/dialog";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { EventDraft, EventTeam } from "../event_schemas";

export function EventTeamPanel({
  event,
  disabled,
  onSaved,
}: {
  event: EventDraft;
  disabled: boolean;
  onSaved: (event: EventDraft) => void;
}) {
  const { data, error: loadError } = useResource<EventTeam>(
    `/api/admin/events/${event.id}/team`,
  );
  const [role, setRole] = useState<"editor" | "registration-manager">("editor");
  const [userId, setUserId] = useState("");
  const [review, setReview] = useState<{
    operation: "grant" | "revoke";
    role: "editor" | "registration-manager";
    userId: string;
    name: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canManage =
    !event.archived && event.capabilities.includes("events.team.manage");
  const candidates =
    data?.candidates.filter(
      (candidate) =>
        !data.members.some((person) => person.userId === candidate.userId),
    ) ?? [];
  async function confirm() {
    if (!review || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved = await request<EventDraft>(
        `/api/admin/events/${event.id}/editors`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: review.userId,
            role: review.role,
            operation: review.operation,
            expectedVersion: event.version,
            confirmed: true,
          }),
        },
      );
      setReview(undefined);
      onSaved(saved);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel form-stack settings-form" aria-label="Event team">
      <h2>Event team</h2>
      <p className="small muted">
        Editors can edit this event's draft details and pages. The responsible
        manager also manages publication, features, its team and archival.
        Club-wide permissions remain separate.
      </p>
      {loadError ? (
        <Notice>{loadError}</Notice>
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <ul className="content-rows">
            {data.members.map((person) => (
              <li className="content-row" key={person.userId}>
                <div>
                  <strong>{person.name}</strong>
                  <p className="small muted">
                    {person.role === "manager"
                      ? "Responsible manager"
                      : person.role === "registration-manager"
                        ? "Registration manager"
                        : "Event editor"}
                    {person.status !== "approved"
                      ? ` · ${person.status} — access inactive`
                      : ""}
                  </p>
                </div>
                {canManage && person.role !== "manager" && (
                  <button
                    className="button button-outline button-small"
                    disabled={disabled || busy}
                    onClick={() =>
                      setReview({
                        ...person,
                        role:
                          person.role === "registration-manager"
                            ? "registration-manager"
                            : "editor",
                        operation: "revoke",
                      })
                    }
                  >
                    {person.role === "editor"
                      ? "Remove editor"
                      : "Remove registration manager"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <form
              className="form-stack"
              onSubmit={(submission) => {
                submission.preventDefault();
                const candidate = candidates.find(
                  (person) => person.userId === userId,
                );
                if (candidate)
                  setReview({ ...candidate, role, operation: "grant" });
              }}
            >
              <label>
                Event role
                <select
                  value={role}
                  disabled={disabled || busy}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                >
                  <option value="editor">Event editor</option>
                  <option value="registration-manager">
                    Registration manager
                  </option>
                </select>
              </label>
              <label>
                Add event editor
                <select
                  required
                  value={userId}
                  disabled={disabled || busy}
                  onChange={(change) => setUserId(change.target.value)}
                >
                  <option value="">Choose an approved member</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.userId} value={candidate.userId}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <button
                  className="button button-outline"
                  disabled={disabled || busy || !userId}
                >
                  Review editor access
                </button>
              </div>
              {disabled && (
                <p className="field-help">
                  Save your event changes before changing team access.
                </p>
              )}
            </form>
          )}
        </>
      )}
      {review && (
        <Dialog
          title="Review event editor access"
          onClose={() => setReview(undefined)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              {review.operation === "grant" ? "Grant" : "Remove"}{" "}
              <strong>{review.name}</strong>'s {review.role} access to{" "}
              <strong>{event.title}</strong>.
            </p>
            <p>
              {review.operation === "grant"
                ? review.role === "registration-manager"
                  ? "This permits private form response review, export and registration cancellation for this event only. It does not permit website editing, publication or changing registration settings."
                  : "This permits editing only this event's private draft details. It does not grant team management, archival, global website editing or access to other events."
                : "This assignment stops permitting access immediately. Independent club permissions, if any, continue to apply."}
            </p>
            <p className="small muted">
              Recent sign-in is required. Event details and feature settings
              stay unchanged.
            </p>
            {error && <Notice>{error}</Notice>}
            <button
              className="button button-accent"
              disabled={busy}
              onClick={() => void confirm()}
            >
              Confirm event editor access
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
