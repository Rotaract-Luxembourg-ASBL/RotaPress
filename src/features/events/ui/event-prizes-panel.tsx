"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, request, useResource } from "@/ui/api";
import { MediaPickerScope } from "@/ui/media-picker-scope";
import { Loading, Notice } from "@/ui/primitives";
import type { EventDraft } from "../event_schemas";
import type { EventModuleState } from "../event_modules";
import type { PrizeWorkspace } from "../prize_schemas";
import { EventPrizeForm } from "./event-prize-form";

export type PrizeMutation = (
  path: string,
  body: unknown,
  message: string,
) => Promise<(PrizeWorkspace & { savedId?: string }) | undefined>;
type Props = {
  event: EventDraft;
  moduleState: EventModuleState["state"];
  disabled: boolean;
  active: boolean;
  onSaved: (event: EventDraft) => void;
  onDirtyChange: (dirty: boolean) => void;
};

function PrizeManager({
  event,
  moduleState,
  disabled,
  active,
  onSaved,
  onDirtyChange,
  initial,
}: Props & { initial: PrizeWorkspace }) {
  const [workspace, setWorkspace] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.items[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const dirtyRef = useRef(dirty);
  const operating = useRef(false);
  const endpoint = `/api/admin/events/${event.id}/prizes`;
  const enabled = moduleState === "enabled";
  const selected = workspace.items.find((item) => item.id === selectedId);
  const reportDirty = useCallback(
    (changed: boolean) => {
      dirtyRef.current = changed;
      setDirty(changed);
      onDirtyChange(changed);
    },
    [onDirtyChange],
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (change: BeforeUnloadEvent) => change.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const reload = useCallback(
    async (discard = false) => {
      if (operating.current || (dirtyRef.current && !discard)) return;
      operating.current = true;
      setBusy(true);
      setError("");
      try {
        const updated = await request<PrizeWorkspace>(endpoint);
        if (dirtyRef.current && !discard) return;
        setWorkspace(updated);
        // A passive refresh must not remount an unchanged editor. Reset local
        // input only after the user explicitly agrees to discard it.
        if (discard) {
          reportDirty(false);
          setRefreshVersion((current) => current + 1);
        }
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        operating.current = false;
        setBusy(false);
      }
    },
    [endpoint, reportDirty],
  );
  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      void reload();
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active, moduleState, reload]);
  const mutate: PrizeMutation = async (path, body, success) => {
    operating.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await request<PrizeWorkspace & { savedId?: string }>(
        `${endpoint}${path}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      reportDirty(false);
      setWorkspace(updated);
      setMessage(success);
      window.dispatchEvent(new Event("event-pages-updated"));
      return updated;
    } catch (cause) {
      setError(errorMessage(cause));
      return undefined;
    } finally {
      operating.current = false;
      setBusy(false);
    }
  };
  function select(id: string) {
    if (
      id === selectedId ||
      (dirty && !window.confirm("Discard unsaved prize changes?"))
    )
      return;
    reportDirty(false);
    setSelectedId(id);
  }
  async function toggle() {
    if (
      !window.confirm(
        enabled
          ? "Disable Prizes? Its public gallery will be hidden. Saved prizes and publication history are retained."
          : "Enable Prizes for this event? Previously published prizes can appear again on its published page.",
      )
    )
      return;
    operating.current = true;
    setBusy(true);
    setError("");
    try {
      onSaved(
        await request<EventDraft>(`/api/admin/events/${event.id}/modules`, {
          method: "POST",
          body: JSON.stringify({
            key: "prizes",
            operation: enabled ? "disable" : "enable",
            expectedVersion: event.version,
            confirmed: true,
          }),
        }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      operating.current = false;
      setBusy(false);
    }
  }
  return (
    <MediaPickerScope value={event.id}>
      <section
        className="event-prizes-workspace"
        aria-label="Event prizes"
        aria-busy={busy}
      >
        <p>
          Manage the prizes for this event. Add{" "}
          <strong>Published prizes</strong> in the{" "}
          <Link
            className="text-link"
            href={`/admin/events/${event.id}?tab=website`}
          >
            event page editor
          </Link>{" "}
          to display the gallery.
        </p>
        <div className="event-inline-actions">
          {event.capabilities.includes("events.modules.manage") && (
            <button
              type="button"
              className="button button-outline"
              disabled={
                busy || disabled || dirty || event.archived || event.cancelled
              }
              onClick={() => void toggle()}
            >
              {enabled ? "Disable Prizes" : "Enable Prizes"}
            </button>
          )}
          <button
            type="button"
            className="inline-button"
            disabled={busy}
            onClick={() => {
              if (
                dirty &&
                !window.confirm("Reload prizes and discard unsaved changes?")
              )
                return;
              void reload(true);
            }}
          >
            Reload prizes
          </button>
        </div>
        {!enabled && (
          <Notice kind="info">
            Prizes are {moduleState === "suspended" ? "paused" : "disabled"}.
            The public gallery is hidden and saved records are retained.
          </Notice>
        )}
        {error && <Notice>{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
        <div className="event-prizes-editing">
          <aside className="panel event-prize-list" aria-label="Saved prizes">
            <h3>Prizes</h3>
            {workspace.items.map((item) => (
              <button
                type="button"
                className="event-prize-choice"
                key={item.id}
                aria-current={item.id === selectedId ? "true" : undefined}
                aria-label={`Edit prize ${item.draft.title}`}
                disabled={busy}
                onClick={() => select(item.id)}
              >
                <strong>{item.draft.title}</strong>
                <span>
                  {item.published
                    ? "Published with a saved draft"
                    : "Private draft"}
                </span>
              </button>
            ))}
            {!workspace.items.length && (
              <p>
                No prizes yet. Add a description and an optional public image to
                begin.
              </p>
            )}
            {workspace.canEdit && (
              <button
                type="button"
                className="button button-outline"
                disabled={disabled || busy || !enabled}
                onClick={() => select("")}
              >
                New prize
              </button>
            )}
          </aside>
          <EventPrizeForm
            key={`${selected?.id ?? "new"}:${selected?.version ?? 0}:${refreshVersion}`}
            eventId={event.id}
            record={selected}
            disabled={disabled || busy || !workspace.canEdit || !enabled}
            publicationDisabled={disabled || busy}
            canPublish={workspace.canPublish && enabled}
            canUnpublish={workspace.canUnpublish}
            mutate={mutate}
            onSelected={setSelectedId}
            onDirty={reportDirty}
          />
        </div>
      </section>
    </MediaPickerScope>
  );
}

export function EventPrizesPanel(props: Props) {
  const { data, error, refresh } = useResource<PrizeWorkspace>(
    `/api/admin/events/${props.event.id}/prizes`,
  );
  if (error)
    return (
      <Notice>
        {error}{" "}
        <button type="button" className="inline-button" onClick={refresh}>
          Reload prizes
        </button>
      </Notice>
    );
  return data ? <PrizeManager {...props} initial={data} /> : <Loading />;
}
