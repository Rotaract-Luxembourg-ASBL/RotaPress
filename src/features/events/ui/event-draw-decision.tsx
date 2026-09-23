"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import type { DrawRecord } from "../draw_schemas";
import { EventWinnerList } from "./event-winner-list";
import { useDrawMutation } from "./use-draw-mutation";

export type DrawOperation = "run" | "publish" | "unpublish" | "cancel";
const titles = {
  run: "Run the demonstration draw",
  publish: "Review public winner names",
  unpublish: "Withdraw public winners",
  cancel: "Void this demonstration draw",
};
export function DrawDecisionDialog({
  eventId,
  draw,
  operation,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  eventId: string;
  draw: DrawRecord;
  operation: DrawOperation;
  onClose: () => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  // Public labels are deliberately entered, never populated from private participant names.
  const [names, setNames] = useState<Record<string, string>>({});
  const mutation = useDrawMutation();
  const awards = draw.result?.awards ?? [];
  const winners = awards.flatMap((award) => {
    const displayName = names[`${award.prizeId}:${award.unit}`]?.trim();
    return displayName
      ? [{ prizeId: award.prizeId, unit: award.unit, displayName }]
      : [];
  });
  const canClose = () =>
    !mutation.busy &&
    (!dirty || window.confirm("Discard this unsaved draw decision?"));
  function close() {
    onDirtyChange(false);
    onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = await mutation.submit(
      `/api/admin/events/${eventId}/draws/${draw.id}/${operation === "run" ? "run" : "review"}`,
      operation === "run"
        ? { expectedDigest: draw.digest, confirmed }
        : {
            expectedVersion: draw.version,
            operation,
            reason,
            winners,
            confirmed,
          },
      operation !== "run",
    );
    if (saved) {
      onDirtyChange(false);
      onSaved();
    }
  }
  return (
    <Dialog title={titles[operation]} onClose={close} canClose={canClose}>
      <form
        className="draw-dialog-form"
        onSubmit={(e) => void submit(e)}
        onChange={() => {
          setDirty(true);
          onDirtyChange(true);
        }}
      >
        <fieldset disabled={mutation.busy} className="draw-fields">
          <p className="entry-demo-note">
            Demonstration only. No real prize awards.
          </p>
          <h3>{draw.snapshot.title}</h3>
          {operation === "run" && (
            <>
              <p>
                This selects {draw.snapshot.slots.length} winners from the
                frozen entries. The result is saved once and stays private until
                reviewed for publication.
              </p>
              <p>{draw.snapshot.rules.purpose}</p>
              <p>
                {draw.snapshot.rules.repeatWinners
                  ? "Participants may win multiple prizes; entries cannot repeat."
                  : "Each participant can win at most one prize in this draw."}
              </p>
            </>
          )}
          {operation === "cancel" && (
            <p>
              Withdraw any public winners and release this draw's reserved
              prizes. The frozen entries, result and reason remain in history.
              To practice again, prepare a new draw.
            </p>
          )}
          {operation === "unpublish" && (
            <p>
              Remove these names from the event website. Keep the saved result
              and its prize reservations.
            </p>
          )}
          {operation === "publish" && (
            <>
              <p>
                Enter only names or aliases approved for public display. Leave a
                field empty to keep that winner private. Payment references and
                private entry records are never included.
              </p>
              {awards.map((award, index) => {
                const key = `${award.prizeId}:${award.unit}`;
                const prize = draw.snapshot.slots.find(
                  (slot) =>
                    slot.prizeId === award.prizeId && slot.unit === award.unit,
                )!;
                const participant = draw.snapshot.candidates.find(
                  (entry) => entry.entryId === award.entryId,
                )!;
                return (
                  <div className="draw-winner-choice" key={key}>
                    <strong>
                      {prize.title} · Item {prize.unit}
                    </strong>
                    <p className="field-help">
                      Private record: {participant.label}
                    </p>
                    <label>
                      Public name for winner {index + 1}
                      <input
                        maxLength={80}
                        value={names[key] ?? ""}
                        onChange={(e) =>
                          setNames({ ...names, [key]: e.target.value })
                        }
                        placeholder="For example, Demo participant A"
                      />
                    </label>
                  </div>
                );
              })}
              {winners.length > 0 && (
                <div className="draw-public-preview">
                  <p>Visitors will see:</p>
                  <EventWinnerList
                    title="Demonstration winners"
                    items={winners.map((winner) => ({
                      displayName: winner.displayName,
                      prizeTitle: draw.snapshot.slots.find(
                        (slot) =>
                          slot.prizeId === winner.prizeId &&
                          slot.unit === winner.unit,
                      )!.title,
                    }))}
                  />
                </div>
              )}
            </>
          )}
          {operation !== "run" && (
            <label>
              Reason for this decision
              <textarea
                required
                minLength={5}
                maxLength={1000}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {operation === "publish"
              ? "I approve exactly the public names shown above."
              : "I reviewed this demonstration decision."}
          </label>
        </fieldset>
        {mutation.error && <Notice>{mutation.error}</Notice>}
        <footer className="entry-dialog-actions">
          <button
            className="button button-outline"
            type="button"
            disabled={mutation.busy}
            onClick={() => {
              if (canClose()) close();
            }}
          >
            Cancel
          </button>
          <button
            className="button button-accent"
            type="submit"
            disabled={
              mutation.busy ||
              !confirmed ||
              (operation === "publish" && !winners.length)
            }
          >
            {mutation.busy
              ? "Saving…"
              : {
                  run: "Run demonstration",
                  publish: "Publish approved names",
                  unpublish: "Withdraw names",
                  cancel: "Void draw",
                }[operation]}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
