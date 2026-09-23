"use client";
import { useState } from "react";
import Link from "next/link";
import { request, useResource, errorMessage } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { EventDraft } from "../../events/event_schemas";
import type { GuestWorkspace } from "../guest_schemas";

export function GuestAccessPanel(props: {
  event: EventDraft;
  disabled: boolean;
  onSaved: (event: EventDraft) => void;
}) {
  return props.event.capabilities.includes("events.guests.manage") ? (
    <Workspace {...props} />
  ) : null;
}
function Workspace({
  event,
  disabled,
  onSaved,
}: {
  event: EventDraft;
  disabled: boolean;
  onSaved: (event: EventDraft) => void;
}) {
  const { data, error, refresh } = useResource<GuestWorkspace>(
    `/api/admin/events/${event.id}/guests`,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [selected, setSelected] = useState("");
  const enabled = data?.modules.some(
    (m) => m.key === "portal" && m.state === "enabled",
  );
  const website = data?.modules.some(
    (m) => m.key === "website" && m.state === "enabled",
  );
  const locked = busy || disabled;
  async function changeModule() {
    if (
      !window.confirm(
        enabled
          ? "Disable the guest portal? All guest access stops; invitations and bookings are retained."
          : "Enable the guest portal for this event? Only explicitly invited, verified guests can access it.",
      )
    )
      return;
    setBusy(true);
    setProblem(undefined);
    try {
      onSaved(
        await request<EventDraft>(`/api/admin/events/${event.id}/modules`, {
          method: "POST",
          body: JSON.stringify({
            key: "portal",
            operation: enabled ? "disable" : "enable",
            expectedVersion: event.version,
            confirmed: true,
          }),
        }),
      );
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function grant() {
    const candidate = data?.candidates.find(
      (c) => `${c.source}:${c.id}` === selected,
    );
    if (
      !candidate ||
      !window.confirm(
        `Grant ${candidate.name} access to their own booking${candidate.sourceLabel ? ` from ${candidate.sourceLabel}` : ""} and the published details of ${event.title}? They must sign in with ${candidate.email}.`,
      )
    )
      return;
    setBusy(true);
    setProblem(undefined);
    setMessage(undefined);
    try {
      await request(`/api/admin/events/${event.id}/guests`, {
        method: "POST",
        body: JSON.stringify({
          source: candidate.source,
          sourceId: candidate.id,
          confirmed: true,
        }),
      });
      setSelected("");
      refresh();
      setMessage(
        "Invitation ready. Share the guest portal link; no invitation email has been sent.",
      );
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(row: GuestWorkspace["grants"][number]) {
    if (
      !window.confirm(
        `Revoke portal access for ${row.name}? Their booking is retained.`,
      )
    )
      return;
    setBusy(true);
    setProblem(undefined);
    setMessage(undefined);
    try {
      await request(`/api/admin/events/${event.id}/guests/${row.id}/revoke`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: row.version, confirmed: true }),
      });
      refresh();
      setMessage("Guest access revoked. Their booking is retained.");
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel form-stack"
      aria-label="Guest portal access"
      aria-busy={busy}
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">Private event access</p>
          <h2>Guest portal</h2>
          <p className="muted">
            Invite existing guests to see their own booking and published event
            details.
          </p>
        </div>
        <span className="badge">
          {data?.modules.find((m) => m.key === "portal")?.state ?? "Loading"}
        </span>
      </div>
      {(error || problem) && (
        <Notice>
          {error || problem}{" "}
          <button className="inline-button" onClick={refresh}>
            Refresh access
          </button>
        </Notice>
      )}
      {message && <Notice kind="success">{message}</Notice>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <p>
            Registration and imports do not grant access automatically. Guests
            verify the invited email and accept their invitation. This gives no
            club membership or administration access.
          </p>
          {event.capabilities.includes("events.modules.manage") &&
            !event.archived &&
            !event.cancelled && (
              <div>
                <button
                  className="button button-outline"
                  disabled={locked || (!enabled && !website)}
                  onClick={() => void changeModule()}
                >
                  {enabled ? "Disable Guest portal" : "Enable Guest portal"}
                </button>
                {!website && (
                  <p className="field-help">
                    Enable Website in Pages and publication first.
                  </p>
                )}
              </div>
            )}
          {(!enabled || !data.published) && (
            <Notice kind="info">
              Enable the portal and publish the event before inviting guests.
              Existing invitations remain saved.
            </Notice>
          )}
          {enabled && data.published && !event.archived && !event.cancelled && (
            <div className="form-stack">
              <label>
                Guest to invite
                <select
                  value={selected}
                  disabled={locked}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Choose an existing guest</option>
                  {data.candidates.map((c) => (
                    <option
                      key={`${c.source}:${c.id}`}
                      value={`${c.source}:${c.id}`}
                    >
                      {c.name} — {c.email} (
                      {c.source === "native"
                        ? "Registration"
                        : `Luma${c.sourceLabel ? ` · ${c.sourceLabel}` : ""}`}
                      , {c.status})
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <button
                  className="button button-accent"
                  disabled={locked || !selected}
                  onClick={() => void grant()}
                >
                  Grant guest access
                </button>
              </div>
              {!data.candidates.length && (
                <p className="muted">
                  No uninvited eligible guests. Add a native registration or
                  reconcile Luma guests first.
                </p>
              )}
            </div>
          )}
          <p>
            Guest entry point:{" "}
            <Link href="/guest" target="_blank" rel="noreferrer">
              Open guest portal
            </Link>
            . Share this link with invited guests; it contains no access token.
          </p>
          <div>
            <button
              className="button button-outline"
              disabled={locked}
              onClick={refresh}
            >
              Refresh invitations
            </button>
          </div>
          <ul className="content-rows">
            {data.grants.map((row) => (
              <li className="content-row" key={row.id}>
                <div>
                  <strong>{row.name}</strong>
                  <p>{row.email}</p>
                  {row.sourceLabel && (
                    <p className="small muted">
                      Booking source: {row.sourceLabel}
                    </p>
                  )}
                  <p className="small muted">
                    {row.source === "native" ? "Registration" : "Luma import"} ·{" "}
                    {row.status}
                    {!row.available && row.status !== "revoked"
                      ? " · Source changed or unavailable; access blocked"
                      : ""}
                  </p>
                </div>
                {row.status !== "revoked" && (
                  <button
                    className="button button-outline"
                    disabled={locked}
                    onClick={() => void revoke(row)}
                    aria-label={`Revoke access for ${row.name}`}
                  >
                    Revoke access
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!data.grants.length && (
            <p className="muted">No guest invitations yet.</p>
          )}
          {data.limited && (
            <p className="field-help">
              Showing up to 200 recent records per source and 200 invitations.
              Full guest search is not available in this first release.
            </p>
          )}
        </>
      )}
    </section>
  );
}
