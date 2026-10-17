"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AdminMediaAssetDto,
  MediaAssetDto,
} from "@/features/media/media_schemas";
import { errorMessage, request } from "./api";
import { MediaBulkEditor } from "./media-bulk-editor";
import { Notice } from "./primitives";

type BatchAction =
  | "delete"
  | { visibility: "public" | "private" }
  | { collection?: string; tags?: string[] };

function managedAsset(asset: MediaAssetDto): asset is AdminMediaAssetDto {
  return (
    "metadataRevision" in asset &&
    typeof asset.metadataRevision === "string" &&
    /^[a-f0-9]{64}$/.test(asset.metadataRevision)
  );
}

/** Library management selection is independent from image insertion and gallery placement. */
export function useMediaBulkActions({
  enabled,
  onUpdated,
  onDeleted,
  onRefresh,
  onCompleted,
}: {
  enabled: boolean;
  onUpdated: (assets: AdminMediaAssetDto[]) => void;
  onDeleted: (ids: string[]) => void;
  onRefresh: () => void;
  onCompleted?: () => void;
}) {
  const [selected, setSelected] = useState(
    new Map<string, AdminMediaAssetDto>(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const previous = useRef<string | undefined>(undefined);

  function toggle(asset: MediaAssetDto, shown: MediaAssetDto[], range = false) {
    if (!enabled || busy) return;
    const start = shown.findIndex((item) => item.id === previous.current);
    const end = shown.findIndex((item) => item.id === asset.id);
    const targets =
      range && start >= 0 && end >= 0
        ? shown.slice(Math.min(start, end), Math.max(start, end) + 1)
        : [asset];
    const next = new Map(selected);
    const removing = next.has(asset.id);
    for (const item of targets) {
      if (removing) next.delete(item.id);
      else if (managedAsset(item) && next.size < 250) next.set(item.id, item);
    }
    if (targets.some((item) => !managedAsset(item)))
      setError(
        "Refresh the library before selecting these files for bulk changes.",
      );
    else setError(undefined);
    setSelected(next);
    previous.current = asset.id;
    if (!removing && next.size === 250)
      setMessage("250 files selected. Apply an action before selecting more.");
  }
  function selectShown(shown: MediaAssetDto[]) {
    if (!enabled || busy) return;
    const next = new Map(selected);
    for (const item of shown)
      if (managedAsset(item) && next.size < 250) next.set(item.id, item);
    if (shown.some((item) => !managedAsset(item)))
      setError(
        "Refresh the library before selecting these files for bulk changes.",
      );
    setSelected(next);
    if (next.size === 250 && shown.some((item) => !next.has(item.id)))
      setMessage(
        "250 files selected. Apply an action before selecting the remaining files.",
      );
  }
  function clear() {
    if (!busy) {
      setSelected(new Map());
      setError(undefined);
      setMessage("");
      previous.current = undefined;
    }
  }
  function sync(assets: AdminMediaAssetDto[]) {
    setSelected((current) => {
      const next = new Map(current);
      for (const asset of assets)
        if (next.has(asset.id)) next.set(asset.id, asset);
      return next;
    });
  }
  function forget(ids: string[]) {
    setSelected((current) => {
      const next = new Map(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }
  async function run(action: BatchAction) {
    if (!enabled || busy || !selected.size) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Delete ${selected.size} selected files permanently? This cannot be undone. Files used by saved content or revision history cannot be deleted. If any file is protected, the entire selection is kept.`,
      )
    )
      return;
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      const result = await request<{
        assets?: AdminMediaAssetDto[];
        deletedIds?: string[];
      }>("/api/admin/media", {
        method: action === "delete" ? "DELETE" : "PATCH",
        body: JSON.stringify({
          assets: [...selected.values()].map((asset) => ({
            id: asset.id,
            expectedRevision: asset.metadataRevision,
          })),
          ...(action === "delete" ? {} : action),
        }),
      });
      if (action === "delete")
        onDeleted(result.deletedIds ?? [...selected.keys()]);
      else onUpdated(result.assets ?? []);
      setMessage(
        action === "delete"
          ? `${selected.size} files deleted.`
          : "visibility" in action
            ? `${selected.size} files made ${action.visibility}.`
            : `${selected.size} files updated.`,
      );
      setSelected(new Map());
      setEditing(false);
      onRefresh();
      onCompleted?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function refreshSelected() {
    if (!enabled || busy || !selected.size) return;
    setBusy(true);
    setError(undefined);
    const entries = [...selected.values()];
    const next = new Map(selected);
    const updated: AdminMediaAssetDto[] = [];
    const failures: string[] = [];
    let cursor = 0;
    async function worker() {
      while (cursor < entries.length) {
        const asset = entries[cursor++];
        try {
          const result = await request<{ asset: AdminMediaAssetDto }>(
            `/api/admin/media/${asset.id}`,
          );
          next.set(asset.id, result.asset);
          updated.push(result.asset);
        } catch (cause) {
          failures.push(
            `${asset.title || asset.originalName}: ${errorMessage(cause)}`,
          );
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(4, entries.length) }, () => worker()),
    );
    setSelected(next);
    onUpdated(updated);
    onRefresh();
    setBusy(false);
    if (failures.length) setError(failures.join(" "));
    else
      setMessage(
        "Selected files refreshed. Review your selection and retry the action.",
      );
  }
  return {
    selected,
    selectedIds: new Set(selected.keys()),
    busy,
    error,
    message,
    editing,
    setEditing,
    toggle,
    selectShown,
    clear,
    sync,
    forget,
    run,
    refreshSelected,
  };
}

export type MediaBulkState = ReturnType<typeof useMediaBulkActions>;

export function MediaBulkActions({
  bulk,
  assets,
  mode,
  onMode,
  disabled,
  description,
  active = true,
}: {
  bulk: MediaBulkState;
  assets: MediaAssetDto[];
  mode: boolean;
  onMode: (value: boolean) => void;
  disabled?: boolean;
  description?: string;
  active?: boolean;
}) {
  const modeTrigger = useRef<HTMLButtonElement>(null);
  const previousBusy = useRef(false);
  const focusPending = useRef(false);
  useEffect(() => {
    if (previousBusy.current && !bulk.busy && !bulk.editing)
      focusPending.current = true;
    previousBusy.current = bulk.busy;
    if (
      focusPending.current &&
      !bulk.busy &&
      !bulk.editing &&
      !disabled &&
      active
    ) {
      modeTrigger.current?.focus();
      focusPending.current = false;
    }
  }, [bulk.busy, bulk.editing, disabled, active]);
  return (
    <div className="media-bulk-workspace">
      <div
        className="media-bulk-toolbar"
        aria-label="Bulk media actions"
        aria-busy={bulk.busy}
      >
        <button
          ref={modeTrigger}
          type="button"
          className="button button-outline button-small"
          aria-pressed={mode}
          disabled={disabled || bulk.busy}
          onClick={() => onMode(!mode)}
        >
          {mode ? "Done selecting" : "Bulk select"}
        </button>
        {mode ? (
          <>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={
                disabled ||
                bulk.busy ||
                !assets.length ||
                bulk.selected.size >= 250
              }
              onClick={() => bulk.selectShown(assets)}
            >
              Select all shown
            </button>
            <span role="status">
              {bulk.selected.size} selected across pages
            </span>
            {bulk.selected.size > 0 && (
              <>
                <button
                  type="button"
                  className="inline-button"
                  disabled={disabled || bulk.busy}
                  onClick={bulk.clear}
                >
                  Clear selection
                </button>
                <button
                  type="button"
                  className="button button-outline button-small"
                  disabled={disabled || bulk.busy}
                  onClick={() => bulk.run({ visibility: "public" })}
                >
                  Make public
                </button>
                <button
                  type="button"
                  className="button button-outline button-small"
                  disabled={disabled || bulk.busy}
                  onClick={() => bulk.run({ visibility: "private" })}
                >
                  Make private
                </button>
                <button
                  type="button"
                  className="button button-outline button-small"
                  disabled={disabled || bulk.busy}
                  onClick={() => bulk.setEditing(true)}
                >
                  Edit selected
                </button>
                <button
                  type="button"
                  className="inline-button media-delete"
                  disabled={disabled || bulk.busy}
                  onClick={() => bulk.run("delete")}
                >
                  Delete permanently
                </button>
              </>
            )}
          </>
        ) : (
          <span>
            Select several files to change visibility or organize them together.
          </span>
        )}
        {bulk.busy && <span role="status">Updating selected files…</span>}
      </div>
      {mode && description && (
        <p className="field-help media-bulk-explanation">{description}</p>
      )}
      {bulk.error && !bulk.editing && (
        <Notice>
          {bulk.error} Your selection is kept.{" "}
          <button
            type="button"
            className="inline-button"
            disabled={bulk.busy || disabled}
            onClick={bulk.refreshSelected}
          >
            Refresh selected files
          </button>
        </Notice>
      )}
      {bulk.message && <Notice kind="success">{bulk.message}</Notice>}
      {bulk.editing && (
        <MediaBulkEditor
          count={bulk.selected.size}
          busy={bulk.busy}
          error={bulk.error}
          onClose={() => bulk.setEditing(false)}
          onSave={bulk.run}
          onRefresh={bulk.refreshSelected}
        />
      )}
    </div>
  );
}
