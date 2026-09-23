"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useResource } from "@/ui/api";
import { ActionsMenu } from "@/ui/actions-menu";
import { Loading, Notice } from "@/ui/primitives";
import type { DrawRecord, DrawWorkspace } from "../draw_schemas";
import { PrepareDrawDialog } from "./event-draw-prepare";
import { DrawDecisionDialog, type DrawOperation } from "./event-draw-decision";

const status = {
  frozen: "Ready to run",
  drawn: "Result saved",
  cancelled: "Voided",
};
function DrawDetail({
  draw,
  eventId,
  canManage,
  canPublish,
  back,
  decide,
}: {
  draw: DrawRecord;
  eventId: string;
  canManage: boolean;
  canPublish: boolean;
  back: () => void;
  decide: (operation: DrawOperation) => void;
}) {
  const { snapshot } = draw;
  return (
    <article className="draw-detail">
      <button type="button" className="inline-button" onClick={back}>
        ← All draws
      </button>
      <header className="entry-heading">
        <div>
          <p className="eyebrow">Demonstration only</p>
          <h3>{snapshot.title}</h3>
          <span className="badge">{status[draw.state]}</span>
        </div>
        <div className="event-inline-actions">
          {draw.state === "frozen" && (
            <button
              className="button button-accent"
              disabled={!canManage || Boolean(draw.issue)}
              onClick={() => decide("run")}
            >
              Review &amp; run draw
            </button>
          )}
          {draw.state === "drawn" && canPublish && (
            <button
              className="button button-accent"
              disabled={!canManage || Boolean(draw.issue)}
              onClick={() => decide("publish")}
            >
              {draw.published.length
                ? "Review public names"
                : "Review names for publication"}
            </button>
          )}
          {draw.state !== "cancelled" && (
            <ActionsMenu label="Draw actions">
              {draw.published.length > 0 && canPublish && (
                <button onClick={() => decide("unpublish")}>
                  Withdraw public winners
                </button>
              )}
              <button onClick={() => decide("cancel")}>
                Void demonstration draw
              </button>
            </ActionsMenu>
          )}
        </div>
      </header>
      {draw.issue && <Notice>{draw.issue}</Notice>}
      <p>{snapshot.rules.purpose}</p>
      <dl className="entry-totals">
        <div>
          <dt>Frozen entries</dt>
          <dd>
            {snapshot.candidates.reduce(
              (sum, entry) => sum + entry.quantity,
              0,
            )}
          </dd>
        </div>
        <div>
          <dt>Prize items</dt>
          <dd>{snapshot.slots.length}</dd>
        </div>
        <div>
          <dt>Approved public names</dt>
          <dd>{draw.published.length}</dd>
        </div>
      </dl>
      {draw.result && (
        <section aria-label="Private draw results" className="draw-results">
          <h4>Saved result</h4>
          <p className="field-help">
            These participant names are private. Public names are reviewed
            separately.
          </p>
          <ul className="draw-candidate-list">
            {draw.result.awards.map((award) => {
              const slot = snapshot.slots.find(
                (item) =>
                  item.prizeId === award.prizeId && item.unit === award.unit,
              )!;
              const entry = snapshot.candidates.find(
                (item) => item.entryId === award.entryId,
              )!;
              return (
                <li key={`${award.prizeId}:${award.unit}`}>
                  <span>
                    <strong>
                      {slot.title} · Item {slot.unit}
                    </strong>
                    <small>
                      {entry.label} · Entry {award.ticket}
                    </small>
                  </span>
                  <span className="badge">
                    {draw.published.some(
                      (winner) =>
                        winner.prizeId === award.prizeId &&
                        winner.unit === award.unit,
                    )
                      ? "Name approved"
                      : "Private"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="field-help">
            Recorded by {draw.result.createdBy} ·{" "}
            {new Date(draw.result.createdAt).toLocaleString()}
          </p>
        </section>
      )}
      {draw.state !== "cancelled" && (
        <p className="field-help">
          To show approved names, add <strong>Demonstration winners</strong> in{" "}
          <Link
            className="text-link"
            href={`/admin/events/${eventId}?tab=website`}
          >
            Event page
          </Link>{" "}
          and publish the page. A private or unpublished event stays private.
        </p>
      )}
      <details className="draw-evidence">
        <summary>Frozen rules and participants</summary>
        <p>
          {snapshot.rules.repeatWinners
            ? "Participants can win more than one prize. Each entry can win once."
            : "One prize per participant in this draw."}{" "}
          All entries have equal chance.
        </p>
        <p>
          Saved bookings group by guest identity; each manual reference is a
          separate test participant.
        </p>
        <ul className="draw-candidate-list">
          {snapshot.candidates.map((entry) => (
            <li key={entry.entryId}>
              <span>{entry.label}</span>
              <strong>{entry.quantity} entries</strong>
            </li>
          ))}
        </ul>
        <p className="field-help">
          Frozen by {draw.createdBy} ·{" "}
          {new Date(draw.createdAt).toLocaleString()}
        </p>
        <label>
          Frozen record fingerprint
          <input readOnly value={draw.digest} />
        </label>
        {draw.result && (
          <label>
            Result fingerprint
            <input readOnly value={draw.result.digest} />
          </label>
        )}
      </details>
      <details className="draw-evidence">
        <summary>Decision history ({draw.history.length})</summary>
        {draw.history.length ? (
          <ol>
            {draw.history.map((review) => (
              <li key={review.version}>
                <strong>
                  {{
                    cancel: "Draw voided",
                    publish: "Public names approved",
                    unpublish: "Public names withdrawn",
                  }[review.operation] ?? review.operation}
                </strong>
                <p>{review.reason}</p>
                <small>
                  {review.createdBy} ·{" "}
                  {new Date(review.createdAt).toLocaleString()}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            No publication or void decisions yet. The frozen record and saved
            result remain private.
          </p>
        )}
      </details>
    </article>
  );
}

export function EventDrawsPanel({
  eventId,
  active,
  disabled,
  onDirtyChange,
}: {
  eventId: string;
  active: boolean;
  disabled: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { data, error, refresh } = useResource<DrawWorkspace>(
    active ? `/api/admin/events/${eventId}/draws` : null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    "prepare" | { draw: DrawRecord; operation: DrawOperation } | null
  >(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!active || dialog) return;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active, dialog, refresh]);
  const draw = data?.items.find((item) => item.id === selected);
  const ready = Boolean(
    data?.preparation.candidates.length &&
    data.preparation.prizes.some((prize) => prize.availableUnits.length),
  );
  function close() {
    setDialog(null);
    onDirtyChange(false);
  }
  function saved() {
    setMessage(
      dialog === "prepare"
        ? "Draw frozen. Open it to review and run the demonstration."
        : dialog?.operation === "run"
          ? "Result saved. Winner names remain private until approved."
          : dialog?.operation === "publish"
            ? "Approved names saved for the event website."
            : dialog?.operation === "unpublish"
              ? "Public names withdrawn. The result is retained."
              : "Draw voided. History is retained and its prizes are available for a new reviewed draw.",
    );
    close();
    refresh();
  }
  return (
    <section className="event-draws" aria-label="Draws and winners">
      <p className="entry-demo-note">
        Practice only. Real paid draws and real prize awards remain disabled.
      </p>
      {error && (
        <Notice>
          {error}{" "}
          <button type="button" className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {message && <Notice kind="success">{message}</Notice>}
      {data?.unavailableReason && (
        <Notice kind="info">
          {data.unavailableReason} Draw history remains available; public names
          can be withdrawn.
        </Notice>
      )}
      {draw && data ? (
        <DrawDetail
          draw={draw}
          eventId={eventId}
          canManage={data.canManage && !disabled}
          canPublish={data.canPublish}
          back={() => setSelected(null)}
          decide={(operation) => setDialog({ draw, operation })}
        />
      ) : (
        data && (
          <>
            <header className="entry-heading">
              <div>
                <h3>Draws &amp; winners</h3>
                <p>
                  Freeze reviewed entries, run once, then choose what visitors
                  may see.
                </p>
              </div>
              {data.canManage && (
                <button
                  className="button button-accent"
                  disabled={disabled || !ready || data.items.length >= 50}
                  onClick={() => {
                    setMessage("");
                    setDialog("prepare");
                  }}
                >
                  Prepare a draw
                </button>
              )}
            </header>
            <ol className="draw-workflow">
              <li>
                <strong>1. Prepare</strong>
                <span>Review the rules, eligible entries and prizes.</span>
              </li>
              <li>
                <strong>2. Run</strong>
                <span>Save one result from the frozen pool.</span>
              </li>
              <li>
                <strong>3. Share</strong>
                <span>Approve public names separately.</span>
              </li>
            </ol>
            {!ready && (
              <div className="draw-setup-note">
                <p>
                  A new draw needs reviewed entries and at least one available
                  published prize.
                </p>
                <div className="event-inline-actions">
                  <Link
                    className="text-link"
                    href={`/admin/events/${eventId}?tab=prizes&prizeView=entries`}
                  >
                    Review entries
                  </Link>
                  <Link
                    className="text-link"
                    href={`/admin/events/${eventId}?tab=prizes&prizeView=gallery`}
                  >
                    Prepare prize gallery
                  </Link>
                </div>
              </div>
            )}
            <div className="entry-library">
              <div className="entry-filters">
                <h4>Saved draws ({data.items.length})</h4>
                <button
                  className="button button-outline"
                  type="button"
                  onClick={refresh}
                >
                  Refresh draws
                </button>
              </div>
              {data.items.length ? (
                <ul className="entry-list">
                  {data.items.map((item) => (
                    <li key={item.id}>
                      <div className="entry-person">
                        <strong>{item.snapshot.title}</strong>
                        <span>
                          {item.snapshot.slots.length} prize items ·{" "}
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                        {item.issue && (
                          <p>Review needed: entries or prizes changed.</p>
                        )}
                      </div>
                      <span className="badge">{status[item.state]}</span>
                      <button
                        className="button button-outline"
                        onClick={() => {
                          setSelected(item.id);
                          setMessage("");
                        }}
                        aria-label={`Open draw ${item.snapshot.title}`}
                      >
                        Open draw
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="entry-empty">
                  <h4>Your first demonstration draw</h4>
                  <p>
                    Prepare a draw when the entries and prizes are ready.
                    Nothing is selected or published during setup.
                  </p>
                </div>
              )}
            </div>
          </>
        )
      )}
      {dialog === "prepare" && data && (
        <PrepareDrawDialog
          eventId={eventId}
          preparation={data.preparation}
          onClose={close}
          onSaved={saved}
          onDirtyChange={onDirtyChange}
        />
      )}
      {dialog && dialog !== "prepare" && (
        <DrawDecisionDialog
          eventId={eventId}
          {...dialog}
          onClose={close}
          onSaved={saved}
          onDirtyChange={onDirtyChange}
        />
      )}
    </section>
  );
}
