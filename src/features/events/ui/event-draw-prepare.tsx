"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import type { DrawPreparation } from "../draw_schemas";
import { useDrawMutation } from "./use-draw-mutation";

export function PrepareDrawDialog({
  eventId,
  preparation,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  eventId: string;
  preparation: DrawPreparation;
  onClose: () => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useDrawMutation();
  const prizes = preparation.prizes.filter(
    (prize) => (quantities[prize.id] ?? 0) > 0,
  );
  const total = prizes.reduce((sum, prize) => sum + quantities[prize.id], 0);
  const people = new Set(
    preparation.candidates.map((entry) => entry.participantKey),
  ).size;
  const entries = preparation.candidates.reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );
  const validPrizes =
    total > 0 && total <= 20 && total <= (repeat ? entries : people);
  const canClose = () =>
    !mutation.busy &&
    (!dirty || window.confirm("Discard this unsaved draw setup?"));
  function close() {
    onDirtyChange(false);
    onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    const saved = await mutation.submit(`/api/admin/events/${eventId}/draws`, {
      expectedPreparationKey: preparation.key,
      title,
      rules: {
        version: 1,
        purpose,
        selection: "weighted_entries_without_replacement",
        repeatWinners: repeat,
      },
      prizes: prizes.map((prize) => ({
        prizeId: prize.id,
        quantity: quantities[prize.id],
      })),
      confirmed,
    });
    if (saved) {
      onDirtyChange(false);
      onSaved();
    }
  }
  return (
    <Dialog
      title="Prepare a demonstration draw"
      onClose={close}
      canClose={canClose}
    >
      <form
        className="draw-dialog-form"
        onSubmit={(event) => void submit(event)}
        onChange={() => {
          setDirty(true);
          onDirtyChange(true);
        }}
      >
        <ol className="draw-steps" aria-label="Draw preparation stages">
          {["Rules", "Prizes", "Review & freeze"].map((label, index) => (
            <li key={label} aria-current={index === step ? "step" : undefined}>
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <fieldset disabled={mutation.busy}>
          {step === 0 && (
            <div className="draw-fields">
              <p>
                Practice with invented participants and test bookings. This does
                not create real prize awards.
              </p>
              <label>
                Draw name
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="For example, volunteer practice draw"
                />
              </label>
              <label>
                Purpose and demonstration rules
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={3}
                  placeholder="Explain what this practice run is for."
                />
              </label>
              <label>
                Winning limit
                <select
                  value={repeat ? "multiple" : "one"}
                  onChange={(e) => setRepeat(e.target.value === "multiple")}
                >
                  <option value="one">
                    One prize per participant in this draw
                  </option>
                  <option value="multiple">
                    A participant may win more than one prize
                  </option>
                </select>
              </label>
              <p className="field-help">
                Each approved entry has equal chance. Winning entries are
                removed. Bookings sharing the same saved guest count as one
                participant; each manual reference is a separate test
                participant.
              </p>
            </div>
          )}
          {step === 1 && (
            <div className="draw-fields">
              <h3>Choose prizes from the published gallery</h3>
              <p>
                Select up to 20 items. Items reserved by another draw are
                unavailable.
              </p>
              {preparation.prizes
                .filter((prize) => prize.availableUnits.length)
                .map((prize) => (
                  <label className="draw-prize-choice" key={prize.id}>
                    <span>{prize.title}</span>
                    <input
                      type="number"
                      aria-label={`Quantity for ${prize.title}`}
                      min={0}
                      max={Math.min(20, prize.availableUnits.length)}
                      value={quantities[prize.id] ?? 0}
                      onChange={(e) =>
                        setQuantities({
                          ...quantities,
                          [prize.id]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              <p role="status">
                {total} prize items selected · {people} reviewed participants ·{" "}
                {entries} entries
              </p>
              {!validPrizes && (
                <p className="field-help">
                  Choose at least one item, within the available entries and
                  winning limit.
                </p>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="draw-fields">
              <h3>{title}</h3>
              <p>{purpose}</p>
              <p>
                {repeat
                  ? "Participants may win multiple prizes; an entry can win only once."
                  : "One prize per participant in this draw."}
              </p>
              <ul>
                {prizes.map((prize) => (
                  <li key={prize.id}>
                    {prize.title} × {quantities[prize.id]}
                  </li>
                ))}
              </ul>
              <p>
                <strong>
                {entries} entries from {people} {people === 1 ? "participant" : "participants"}
                </strong>{" "}
                will be frozen. {preparation.excludedRecords} held or voided
                records are excluded.
              </p>
              <details>
                <summary>Review included participants</summary>
                <ul className="draw-candidate-list">
                  {preparation.candidates.map((entry) => (
                    <li key={entry.entryId}>
                      <span>{entry.label}</span>
                      <strong>{entry.quantity} entries</strong>
                    </li>
                  ))}
                </ul>
              </details>
              <p>
                Freezing saves the rules and reserves these prize items. It does
                not choose or publish winners. Later changes to these entries
                require a new reviewed draw.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I reviewed this demonstration pool and its rules.
              </label>
            </div>
          )}
        </fieldset>
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <footer className="entry-dialog-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={mutation.busy}
            onClick={() => {
              if (canClose()) close();
            }}
          >
            Cancel
          </button>
          {step > 0 && (
            <button
              type="button"
              className="button button-outline"
              disabled={mutation.busy}
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          <button
            type="submit"
            className="button button-accent"
            disabled={
              mutation.busy ||
              (step === 1 && !validPrizes) ||
              (step === 2 && !confirmed)
            }
          >
            {mutation.busy
              ? "Saving…"
              : step === 2
                ? "Freeze reviewed draw"
                : "Continue"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
