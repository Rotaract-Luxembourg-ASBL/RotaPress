"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { request, useResource, errorMessage } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Loading, Notice } from "@/ui/primitives";
import type { LumaSyncDto } from "../sync_schemas";
import { ReconciliationJobs } from "./reconciliation-jobs";
import { LumaGuestPurchasePanel } from "./luma-guest-purchase-panel";

export function EventLumaSyncPanel({ eventId }: { eventId: string }) {
  const sourceId = useSearchParams().get("sourceId");
  function select(id: string) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("sourceId", id);
    else url.searchParams.delete("sourceId");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  return (
    <SourceLumaSyncPanel
      key={`${eventId}:${sourceId ?? "registration"}`}
      eventId={eventId}
      sourceId={sourceId}
      onSelect={select}
    />
  );
}

function SourceLumaSyncPanel({
  eventId,
  sourceId,
  onSelect,
}: {
  eventId: string;
  sourceId: string | null;
  onSelect: (sourceId: string) => void;
}) {
  const endpoint = `/api/admin/events/${eventId}/luma-api`;
  const { data, error, refresh } = useResource<LumaSyncDto>(
    sourceId
      ? `${endpoint}?sourceId=${encodeURIComponent(sourceId)}`
      : endpoint,
  );
  const [providerId, setProviderId] = useState("");
  const [review, setReview] = useState<{
    action: "link" | "configure" | "reconcile";
    version: number;
    requestId: string;
    sourceId: string;
    sourceLabel: string;
    sourceUrl: string;
  }>();
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const activeJob = data?.jobs?.some(
    (job) => job.status === "pending" || job.status === "processing",
  );
  const selectedSource = data?.sources.find(
    (source) => source.id === data.sourceId,
  );
  useEffect(() => {
    window.addEventListener("event-registration-updated", refresh);
    return () =>
      window.removeEventListener("event-registration-updated", refresh);
  }, [refresh]);
  function open(action: "link" | "configure" | "reconcile") {
    if (!data?.sourceId || !selectedSource) return;
    setReview({
      action,
      version: data.version,
      requestId: crypto.randomUUID(),
      sourceId: data.sourceId,
      sourceLabel: selectedSource.label,
      sourceUrl: selectedSource.url,
    });
    setConfirmed(false);
    setProblem(undefined);
  }
  const panel = (
    <section
      className="panel form-stack"
      aria-label="Luma guest reconciliation"
    >
      <div
        role="region"
        aria-label="Luma reconciliation controls"
        className="form-stack"
      >
        <div>
          <h2>Luma guest reconciliation</h2>
          <p>
            Keep a private, read-only copy of provider guest records for this
            booking source. Switch sources above to review their own records and
            history.
          </p>
        </div>
        {error && (
          <Notice>
            {error}
            {sourceId && (
              <>
                {" "}
                <button
                  type="button"
                  className="inline-button"
                  onClick={() => onSelect("")}
                >
                  Return to registration source
                </button>
              </>
            )}
          </Notice>
        )}
        {!data ? (
          !error && <Loading />
        ) : (
          <>
            {data.mode === "fixture" && (
              <Notice kind="info">
                Synthetic local provider. These records do not verify live Luma
                access.
              </Notice>
            )}
            {data.reason && <Notice kind="info">{data.reason}</Notice>}
            {data.providerEventId ? (
              <>
                <p className="status-badge">
                  {data.enabled
                    ? "Reconciliation enabled"
                    : "Reconciliation disabled"}
                </p>
                <p>
                  Linked API event:{" "}
                  <strong className="break-words">
                    {data.providerEventId}
                  </strong>
                </p>
                <p>
                  {data.lastSuccessAt
                    ? `Last complete reconciliation: ${new Date(data.lastSuccessAt).toLocaleString()}`
                    : "No complete reconciliation yet."}
                </p>
                <div className="forms-actions">
                  <button
                    className="button button-accent"
                    disabled={
                      busy ||
                      activeJob ||
                      !data.enabled ||
                      !data.available ||
                      !data.sourceId
                    }
                    onClick={() => open("reconcile")}
                  >
                    Review guest reconciliation
                  </button>
                  {data.canConfigure && (
                    <button
                      className="button button-outline"
                      disabled={busy || !data.available}
                      onClick={() => open("configure")}
                    >
                      {data.enabled
                        ? "Review disabling reconciliation"
                        : "Review enabling reconciliation"}
                    </button>
                  )}
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={refresh}
                  >
                    Refresh reconciliation status
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  No API event linked. A manager must explicitly select the
                  manageable Luma event that matches the selected booking
                  source's URL.
                </p>
                {data.canConfigure && (
                  <>
                    <label className="field">
                      Luma API event ID
                      <input
                        value={providerId}
                        onChange={(e) => setProviderId(e.target.value)}
                        maxLength={104}
                        placeholder="evt-…"
                        disabled={busy}
                      />
                    </label>
                    <div>
                      <button
                        className="button button-outline"
                        disabled={
                          busy ||
                          !data.available ||
                          !data.sourceId ||
                          !providerId.startsWith("evt-")
                        }
                        onClick={() => open("link")}
                      >
                        Review API event link
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            <p>
              Reconciliation imports names, email addresses, approval status and
              ticket counts only. It grants no membership, guest access, payment
              or prize eligibility. Missing records are retained and labelled,
              never silently deleted.
            </p>
            {data.sourceId && (
              <ReconciliationJobs
                key={data.sourceId}
                jobs={data.jobs ?? []}
                endpoint={endpoint}
                refresh={refresh}
                sourceId={data.sourceId}
              />
            )}
            {data.runs.length > 0 && (
              <div>
                <h3>Recent import attempts</h3>
                <ul className="content-rows">
                  {data.runs.map((run) => (
                    <li className="content-row" key={run.id}>
                      <div>
                        <strong>
                          {run.status === "succeeded"
                            ? `Complete · ${run.guestCount} provider ${run.guestCount === 1 ? "record" : "records"}`
                            : run.status === "running"
                              ? "In progress"
                              : run.status === "interrupted"
                                ? "Interrupted"
                                : "Failed"}
                        </strong>
                        <p className="small muted">
                          {new Date(run.startedAt).toLocaleString()}
                        </p>
                        {run.message && <p>{run.message}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      {data && (
        <div className="form-stack" aria-label="Private imported guests">
          <h3>Private provider records</h3>
          {selectedSource && (
            <p>
              Booking source: <strong>{selectedSource.label}</strong>
            </p>
          )}
          <p>
            {data.count} retained records.{" "}
            {data.count > data.guests.length
              ? `Showing the first ${data.guests.length}.`
              : ""}{" "}
            Provider observations are historical, not current eligibility.
          </p>
          <ul className="content-rows">
            {data.guests.map((guest) => (
              <li className="content-row" key={guest.id}>
                <div>
                  <strong>{guest.name || "Name not supplied"}</strong>
                  <p className="small break-words">{guest.email}</p>
                  <p className="small muted">
                    {guest.approvalStatus.replaceAll("_", " ")} ·{" "}
                    {guest.ticketCount} tickets ·{" "}
                    {guest.present
                      ? "Returned in last complete reconciliation"
                      : "Not returned in last complete reconciliation"}
                  </p>
                  <p className="small muted">
                    Last observed {new Date(guest.observedAt).toLocaleString()}
                  </p>
                </div>
                <LumaGuestPurchasePanel
                  eventId={eventId}
                  guestId={guest.id}
                  name={guest.name ?? ""}
                  sourceLabel={selectedSource?.label ?? "Luma source"}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && review && (
        <Dialog
          title="Review Luma API event action"
          onClose={() => setReview(undefined)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              Booking source: <strong>{review.sourceLabel}</strong>
            </p>
            <p className="break-words">{review.sourceUrl}</p>
            <p>
              {review.action === "link"
                ? `Link ${providerId} and enable deliberate guest reconciliation for this booking source. RotaPress checks management access, calendar and the selected source URL. This identity cannot be silently replaced later.`
                : review.action === "configure"
                  ? `${data.enabled ? "Disable" : "Enable"} reconciliation for this booking source. Its existing provider records and published checkout links are retained. Enabling does not start an import.`
                  : "Queue one reconciliation of this booking source's provider guest pages. Its private projection updates only after all pages succeed. Local content, registrations and other booking sources remain unchanged."}
            </p>
            <p>
              {data.mode === "fixture"
                ? "This installation uses a synthetic loopback provider."
                : "This action uses the club's checked server-side API connection."}
            </p>
            {review.action === "reconcile" && (
              <p>
                Up to 1,000 guests across 20 pages, with at most three attempts.
                Temporary failures retry after a minute. The request survives a
                local worker restart and requires your current login and event
                access. Changing event, registration or connection settings
                cancels the reviewed request. You can cancel it before
                completion.
              </p>
            )}
            {problem && (
              <Notice>
                {problem}{" "}
                <button
                  className="inline-button"
                  onClick={() => {
                    setReview(undefined);
                    refresh();
                  }}
                >
                  Reload current state
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
              I confirm this event's API action.
            </label>
            <button
              className="button button-accent"
              disabled={busy || !confirmed}
              onClick={async () => {
                setBusy(true);
                setProblem(undefined);
                try {
                  await request(`${endpoint}/${review.action}`, {
                    method: "POST",
                    body: JSON.stringify({
                      expectedVersion: review.version,
                      sourceId: review.sourceId,
                      confirmed: true,
                      ...(review.action === "link"
                        ? { providerEventId: providerId }
                        : review.action === "configure"
                          ? { enabled: !data.enabled }
                          : { requestId: review.requestId }),
                    }),
                  });
                  setReview(undefined);
                  refresh();
                } catch (cause) {
                  setProblem(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Working…" : "Confirm event API action"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
  const content =
    data && !data.available ? (
      <details className="event-retained-integration">
        <summary>Luma guest imports (unavailable)</summary>
        {panel}
      </details>
    ) : (
      panel
    );
  return (
    <div className="form-stack">
      {data && (
        <section className="panel form-stack" aria-label="Luma booking source">
          <label>
            Booking source
            <select
              value={data.sourceId ?? ""}
              disabled={busy || Boolean(review)}
              onChange={(event) => onSelect(event.target.value)}
            >
              {!data.sourceId && (
                <option value="" disabled>
                  Select a booking source
                </option>
              )}
              {data.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                  {source.enabled ? "" : " (disabled)"}
                </option>
              ))}
            </select>
          </label>
          {selectedSource && (
            <p className="break-words">{selectedSource.url}</p>
          )}
          <p className="field-help">
            Each source has its own API link, guest records and import history.
            Additional sources are configured in Packages.
          </p>
        </section>
      )}
      {content}
    </div>
  );
}
