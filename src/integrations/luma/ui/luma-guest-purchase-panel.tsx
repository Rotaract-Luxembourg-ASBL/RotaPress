"use client";

import { useState } from "react";
import { Dialog } from "@/ui/dialog";
import { Loading, Notice } from "@/ui/primitives";
import { errorMessage, request, useResource } from "@/ui/api";
import type { PurchaseView } from "@/features/guests/purchase_schemas";
import { PurchaseSummary } from "@/features/guests/ui/purchase-summary";

function SavedPurchaseDetails({
  endpoint,
  initial,
  onBusy,
}: {
  endpoint: string;
  initial: PurchaseView;
  onBusy: (busy: boolean) => void;
}) {
  const [view, setView] = useState(initial);
  const [review, setReview] = useState<{
    expectedVersion: number;
    requestId: string;
  }>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  async function reload() {
    setBusy(true);
    onBusy(true);
    setProblem("");
    try {
      setView(await request<PurchaseView>(endpoint));
      setReview(undefined);
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function refresh() {
    if (!review) return;
    setBusy(true);
    onBusy(true);
    setProblem("");
    setMessage("");
    try {
      const updated = await request<PurchaseView>(`${endpoint}/refresh`, {
        method: "POST",
        body: JSON.stringify({ ...review, confirmed: true }),
      });
      setView(updated);
      setReview(undefined);
      setMessage(
        updated.status === "observed"
          ? "Purchase details saved."
          : "Purchase refresh finished. Review the status below.",
      );
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="form-stack" aria-busy={busy}>
      {problem && <Notice>{problem}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <PurchaseSummary view={view} />
      {review ? (
        <section
          className="panel form-stack"
          aria-label="Review purchase refresh"
        >
          <h3>Review purchase refresh</h3>
          <p>
            Read this guest's detailed purchase record from the selected Luma
            source and save the returned orders and tickets. The guest can then
            view their saved details through an existing invitation. This does
            not issue an invitation, change a booking or grant prize
            eligibility.
          </p>
          <label className="forms-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I confirm this guest's purchase refresh.
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="button button-accent"
              disabled={busy || !confirmed || !view.refreshAllowed}
              onClick={() => void refresh()}
            >
              Confirm purchase refresh
            </button>
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => setReview(undefined)}
            >
              Keep saved details
            </button>
          </div>
        </section>
      ) : (
        <div className="form-actions">
          <button
            type="button"
            className="button button-accent"
            disabled={busy || !view.refreshAllowed}
            onClick={() => {
              setReview({
                expectedVersion: view.version,
                requestId: crypto.randomUUID(),
              });
              setConfirmed(false);
              setProblem("");
              setMessage("");
            }}
          >
            Review purchase refresh
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload saved details
          </button>
        </div>
      )}
    </div>
  );
}

function PurchaseDialogContent({
  eventId,
  guestId,
  onBusy,
}: {
  eventId: string;
  guestId: string;
  onBusy: (busy: boolean) => void;
}) {
  const endpoint = `/api/admin/events/${eventId}/luma-guests/${guestId}/purchases`;
  const { data, error, refresh } = useResource<PurchaseView>(endpoint);
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button type="button" className="inline-button" onClick={refresh}>
          Reload purchase details
        </button>
      </Notice>
    );
  return data ? (
    <SavedPurchaseDetails endpoint={endpoint} initial={data} onBusy={onBusy} />
  ) : (
    <Loading />
  );
}

/** Opening saved details is read-only; provider refresh requires a separate review. */
export function LumaGuestPurchasePanel({
  eventId,
  guestId,
  name,
  sourceLabel,
}: {
  eventId: string;
  guestId: string;
  name: string;
  sourceLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button button-outline button-small"
        onClick={() => setOpen(true)}
      >
        Purchase details
      </button>
      {open && (
        <Dialog
          title="Guest purchase details"
          onClose={() => setOpen(false)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              Guest: <strong>{name || "Name not supplied"}</strong>
              <br />
              Booking source: <strong>{sourceLabel}</strong>
            </p>
            <PurchaseDialogContent
              eventId={eventId}
              guestId={guestId}
              onBusy={setBusy}
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
