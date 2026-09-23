"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "@/ui/dialog";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { money } from "../../guests/ui/purchase-summary";
import type {
  EntryBooking,
  EntryBookingOrders,
  EntryRecord,
  ReviewEntry,
} from "../entry_schemas";

type Props = {
  eventId: string;
  onClose: () => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
};
const stateLabel = {
  ready: "Ready for demonstration",
  held: "On hold",
  void: "Voided",
};

function EntryDialog({
  title,
  endpoint,
  children,
  payload,
  canSubmit = true,
  submitLabel,
  ...props
}: Props & {
  title: string;
  endpoint: string;
  children: ReactNode;
  payload: object;
  canSubmit?: boolean;
  submitLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const replay = useRef({ signature: "", requestId: "" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !canSubmit) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const signature = JSON.stringify(payload);
    if (replay.current.signature !== signature)
      replay.current = { signature, requestId: crypto.randomUUID() };
    try {
      await request(endpoint, {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          mode: "demo",
          requestId: replay.current.requestId,
        }),
      });
      props.onDirtyChange(false);
      props.onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const canClose = () =>
    !busy && (!dirty || window.confirm("Discard this unsaved entry decision?"));
  function close() {
    props.onDirtyChange(false);
    props.onClose();
  }
  return (
    <Dialog title={title} onClose={close} canClose={canClose}>
      <form
        className="entry-dialog-form"
        onSubmit={(event) => void submit(event)}
        onChange={() => {
          setDirty(true);
          props.onDirtyChange(true);
        }}
      >
        <fieldset disabled={busy}>{children}</fieldset>
        {error && <Notice>{error}</Notice>}
        <footer className="entry-dialog-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => {
              if (canClose()) close();
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button-accent"
            disabled={busy || !canSubmit}
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function BookingOrders({
  endpoint,
  onSelect,
}: {
  endpoint: string;
  onSelect: (reference: string, key: string) => void;
}) {
  const { data, error, refresh } = useResource<EntryBookingOrders>(endpoint);
  const labelId = useId();
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button type="button" className="inline-button" onClick={refresh}>
          Try again
        </button>
      </Notice>
    );
  if (!data) return <Loading />;
  if (!data.orders.length)
    return (
      <Notice kind="info">
        No usable payment references are saved. Refresh this booking’s purchase
        details in Registration &amp; forms.
      </Notice>
    );
  return (
    <label>
      <span id={labelId}>Payment reference</span>
      <select
        aria-labelledby={labelId}
        required
        defaultValue=""
        onChange={(event) => {
          const row = data.orders.find(
            (order) => order.reference === event.target.value,
          );
          onSelect(row?.reference ?? "", row?.evidence.key ?? "");
        }}
      >
        <option value="" disabled>
          Choose a payment reference
        </option>
        {data.orders.map((row) => (
          <option
            key={row.reference}
            value={row.reference}
            disabled={Boolean(row.evidence.issue)}
          >
            {row.evidence.order &&
              `${money(row.evidence.order.amount, row.evidence.order.currency)} · `}
            {row.reference}
            {row.evidence.issue ? ` — ${row.evidence.issue}` : ""}
          </option>
        ))}
      </select>
      {data.orders.some((row) => row.evidence.issue) && (
        <small>References with refunds or outdated details stay on hold.</small>
      )}
    </label>
  );
}

export function NewEntryDialog(props: Props) {
  const helpId = useId();
  const endpoint = `/api/admin/events/${props.eventId}/entries`;
  const {
    data: bookings,
    error,
    refresh,
  } = useResource<EntryBooking[]>(`${endpoint}/bookings`);
  const [source, setSource] = useState("manual");
  const [label, setLabel] = useState("");
  const [reference, setReference] = useState("");
  const [guestId, setGuestId] = useState("");
  const [evidenceKey, setEvidenceKey] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  return (
    <EntryDialog
      {...props}
      title="Add demonstration entries"
      endpoint={endpoint}
      submitLabel="Add entries"
      canSubmit={
        source === "manual" || Boolean(guestId && reference && evidenceKey)
      }
      payload={{
        source,
        quantity: Number(quantity),
        reason,
        reference,
        ...(source === "manual"
          ? { label }
          : { guestId, expectedEvidenceKey: evidenceKey }),
      }}
    >
      <p className="muted">
        Use invented participants or saved test bookings. These entries stay
        private and cannot award real prizes.
      </p>
      <label>
        Starting point
        <select
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setReference("");
            setEvidenceKey("");
            setGuestId("");
          }}
        >
          <option value="manual">Test participant</option>
          <option value="purchase">Saved test purchase</option>
        </select>
      </label>
      {source === "manual" ? (
        <>
          <label>
            Test participant name
            <input
              required
              maxLength={100}
              value={label}
              placeholder="For example, Test participant A"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label>
            <span id={`${helpId}-reference-label`}>Reference</span>
            <input
              aria-labelledby={`${helpId}-reference-label`}
              aria-describedby={`${helpId}-reference-help`}
              required
              maxLength={240}
              value={reference}
              placeholder="For example, practice-001"
              onChange={(event) => setReference(event.target.value)}
            />
            <small id={`${helpId}-reference-help`}>
              A unique label for this participant’s entry record.
            </small>
          </label>
        </>
      ) : (
        <>
          {error && (
            <Notice>
              {error}{" "}
              <button type="button" className="inline-button" onClick={refresh}>
                Reload bookings
              </button>
            </Notice>
          )}
          {!bookings && !error && <Loading />}
          {bookings?.length === 0 ? (
            <Notice kind="info">
              No test purchases are saved for this event. Choose Test
              participant to practice without a booking.
            </Notice>
          ) : (
            bookings && (
              <label>
                Test booking
                <select
                  required
                  value={guestId}
                  onChange={(event) => {
                    setGuestId(event.target.value);
                    setReference("");
                    setEvidenceKey("");
                  }}
                >
                  <option value="" disabled>
                    Choose a test booking
                  </option>
                  {bookings.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          )}
          {guestId && (
            <BookingOrders
              key={guestId}
              endpoint={`${endpoint}/bookings/${guestId}`}
              onSelect={(value, key) => {
                setReference(value);
                setEvidenceKey(key);
              }}
            />
          )}
        </>
      )}
      <label>
        <span id={`${helpId}-quantity-label`}>Number of entries</span>
        <input
          aria-labelledby={`${helpId}-quantity-label`}
          aria-describedby={`${helpId}-quantity-help`}
          type="number"
          min={1}
          max={10000}
          required
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <small id={`${helpId}-quantity-help`}>
          Choose the count explicitly; payment amounts never set it
          automatically.
        </small>
      </label>
      <label>
        Why are these entries being added?
        <textarea
          required
          minLength={5}
          maxLength={1000}
          rows={3}
          value={reason}
          placeholder="Explain the test allocation for the event team."
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </EntryDialog>
  );
}

export function ReviewEntryDialog({
  entry,
  canManage,
  ...props
}: Props & { entry: EntryRecord; canManage: boolean }) {
  const [decision, setDecision] = useState<ReviewEntry["decision"]>(
    entry.state === "ready" ? "approve" : "hold",
  );
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [reason, setReason] = useState("");
  const readOnly = !canManage || entry.state === "void";
  const details = (
    <>
      <div className="entry-review-summary">
        <strong>{entry.label}</strong>
        <span>
          {stateLabel[entry.state]} · {entry.quantity} entries
        </span>
        <span>
          {entry.source === "manual" ? "Test reference" : "Payment reference"}:{" "}
          {entry.reference}
        </span>
      </div>
      {entry.holdReason && entry.state !== "void" && (
        <Notice kind="info">{entry.holdReason}</Notice>
      )}
      {entry.evidence.order && (
        <p>
          Saved payment:{" "}
          {money(entry.evidence.order.amount, entry.evidence.order.currency)} ·
          Refunded:{" "}
          {money(entry.evidence.order.refunded, entry.evidence.order.currency)}.
          This is test evidence.
        </p>
      )}
      {entry.source === "purchase" && (
        <p className="muted">
          To check for new purchase details, open this booking in{" "}
          <Link
            className="text-link"
            href={`/admin/events/${props.eventId}?tab=participation`}
          >
            Registration &amp; forms
          </Link>
          .
        </p>
      )}
      <details className="entry-history">
        <summary>Decision history ({entry.history.length})</summary>
        <ol>
          {entry.history.map((review) => (
            <li key={review.version}>
              <strong>
                {review.decision === "approve"
                  ? "Approved for demonstration"
                  : review.decision === "hold"
                    ? "Put on hold"
                    : "Voided"}{" "}
                · {review.quantity} entries
              </strong>
              <time dateTime={review.createdAt}>
                {review.actorName} ·{" "}
                {new Date(review.createdAt).toLocaleString()}
              </time>
              <p>{review.reason}</p>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
  if (readOnly)
    return (
      <Dialog title="Entry history" onClose={props.onClose}>
        <div className="entry-dialog-form">
          {details}
          <p className="muted">
            This record is read-only. Its decisions are retained.
          </p>
          <button className="button button-outline" onClick={props.onClose}>
            Close history
          </button>
        </div>
      </Dialog>
    );
  return (
    <EntryDialog
      {...props}
      title="Review entries"
      endpoint={`/api/admin/events/${props.eventId}/entries/${entry.id}/review`}
      submitLabel={decision === "void" ? "Void entries" : "Save decision"}
      canSubmit={decision !== "approve" || !entry.evidence.issue}
      payload={{
        decision,
        quantity: Number(quantity),
        reason,
        expectedVersion: entry.version,
        expectedEvidenceKey: entry.evidence.key,
      }}
    >
      {details}
      <label>
        Decision
        <select
          value={decision}
          onChange={(event) =>
            setDecision(event.target.value as ReviewEntry["decision"])
          }
        >
          <option value="approve" disabled={Boolean(entry.evidence.issue)}>
            Approve for demonstration
          </option>
          <option value="hold">Put on hold</option>
          <option value="void">Void entries</option>
        </select>
      </label>
      {decision === "void" ? (
        <Notice kind="info">
          These entries will be excluded permanently. The participant record and
          decision history will remain.
        </Notice>
      ) : (
        <label>
          Number of entries
          <input
            type="number"
            min={1}
            max={10000}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
      )}
      <label>
        Reason for this decision
        <textarea
          required
          minLength={5}
          maxLength={1000}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </EntryDialog>
  );
}
