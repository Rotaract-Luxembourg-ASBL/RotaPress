"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { useResource } from "./api";
import { useRequestResource } from "./request-resource";
import { MediaBulkActions, useMediaBulkActions } from "./media-bulk-actions";
import { Loading, Notice } from "./primitives";
import { Icon } from "./icon";
import { MediaAssetThumbnail, mediaAssetSize } from "./media-asset-preview";
import { useMediaPickerEvent } from "./media-picker-scope";
import { AssetDetails, MediaUpload, canDiscard } from "./media-editors";
import {
  AssetGrid,
  MediaFilters,
  filterAssets,
  type VisibilityFilter,
} from "./media-browser";

export function MediaPickerDialog({
  currentId,
  onInsert,
  onDismiss,
  onRemoved,
  kind = "image",
}: {
  currentId: string;
  onInsert: (asset: MediaAssetDto) => void;
  onDismiss: () => void;
  onRemoved: (id: string) => void;
  kind?: MediaAssetDto["kind"];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const editorBack = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const insertButton = useRef<HTMLButtonElement>(null);
  const returnFromEditor = useRef(false);
  const insertAfterUpload = useRef(false);
  const eventId = useMediaPickerEvent();
  const prefix = useId();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "48",
    search: query,
    visibility: eventId ? "public" : visibility,
    kind,
  });
  const { data, error, loading, refresh } = useRequestResource<{
    assets: MediaAssetDto[];
    total?: number;
    pageSize?: number;
    page?: number;
  }>(
    eventId
      ? `/api/admin/events/${eventId}/media?${params}`
      : `/api/admin/media?${params}`,
  );
  const linked = useResource<{
    asset?: MediaAssetDto;
    assets?: MediaAssetDto[];
  }>(
    currentId
      ? eventId
        ? `/api/admin/events/${eventId}/media?id=${encodeURIComponent(currentId)}`
        : `/api/admin/media/${encodeURIComponent(currentId)}`
      : null,
  );
  const linkedAsset = linked.data?.asset ?? linked.data?.assets?.[0];
  const [selectedId, setSelectedId] = useState(currentId);
  const [updatedAsset, setUpdatedAsset] = useState<MediaAssetDto>();
  const [editorId, setEditorId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [uploadDirty, setUploadDirty] = useState(false);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [removedIds, setRemovedIds] = useState(new Set<string>());
  const bulk = useMediaBulkActions({
    enabled: !eventId,
    onUpdated: (assets) => {
      const updated = assets.find((asset) => asset.id === selectedId);
      if (updated) setUpdatedAsset(updated);
    },
    onDeleted: (ids) => {
      setRemovedIds((current) => new Set([...current, ...ids]));
      ids.forEach(onRemoved);
      if (ids.includes(selectedId)) {
        setSelectedId("");
        setUpdatedAsset(undefined);
        setEditorId(undefined);
        setEditing(false);
        setDetailsDirty(false);
      }
    },
    onRefresh: refresh,
  });
  const busy = detailsBusy || uploadBusy || bulk.busy;
  const selectedCandidate =
    updatedAsset?.id === selectedId
      ? updatedAsset
      : (data?.assets.find((asset) => asset.id === selectedId) ??
        (linkedAsset?.id === selectedId ? linkedAsset : undefined));
  const selected =
    selectedCandidate?.kind === kind ? selectedCandidate : undefined;
  const noun = kind === "image" ? "image" : "file";
  const assets =
    data?.assets
      .filter((asset) => asset.kind === kind && !removedIds.has(asset.id))
      .map((asset) => (asset.id === updatedAsset?.id ? updatedAsset : asset)) ??
    [];
  if (updatedAsset && !assets.some((asset) => asset.id === updatedAsset.id))
    assets.unshift(updatedAsset);
  const filtered = filterAssets(assets, query, eventId ? "public" : visibility);
  const currentPage = data?.page ?? page;
  function changeBulkMode(next: boolean) {
    if (busy || (next && !canDiscard(detailsDirty))) return;
    if (next) {
      setDetailsDirty(false);
      setEditorId(undefined);
      setEditing(false);
    } else bulk.clear();
    setBulkMode(next);
  }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (editing) editorBack.current?.focus();
    else if (returnFromEditor.current) {
      returnFromEditor.current = false;
      editTrigger.current?.focus();
    }
  }, [editing]);
  useEffect(() => {
    if (insertAfterUpload.current && tab === "library" && !busy) {
      insertAfterUpload.current = false;
      insertButton.current?.focus();
    }
  }, [tab, busy]);

  function dismiss() {
    if (busy || !canDiscard(detailsDirty || uploadDirty)) return;
    dialog.current?.close();
    onDismiss();
  }

  function choose(asset: MediaAssetDto) {
    if (busy || loading || asset.id === selectedId || !canDiscard(detailsDirty))
      return;
    setSelectedId(asset.id);
    setUpdatedAsset(asset);
    setDetailsDirty(false);
    setEditorId(undefined);
    setEditing(false);
  }

  function changeTab(next: "library" | "upload") {
    if (busy || (next === "upload" && !canDiscard(detailsDirty))) return false;
    if (next !== tab && bulkMode) {
      bulk.clear();
      setBulkMode(false);
    }
    if (next === "upload") {
      setDetailsDirty(false);
      setEditorId(undefined);
    }
    setEditing(false);
    setTab(next);
    return true;
  }

  function tabsKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      eventId ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "library"
        : event.key === "End"
          ? "upload"
          : tab === "library"
            ? "upload"
            : "library";
    if (!changeTab(next)) return;
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-media-tab="${next}"]`)
      ?.focus();
  }

  return (
    <dialog
      ref={dialog}
      className="media-dialog"
      aria-labelledby={`${prefix}-title`}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        dismiss();
      }}
    >
      <div className="media-dialog-shell">
        <header className="media-dialog-header">
          <h2 id={`${prefix}-title`}>
            {currentId
              ? `Replace ${noun}`
              : kind === "image"
                ? "Choose an image"
                : `Choose ${kind === "audio" ? "audio" : kind === "video" ? "a video" : "a PDF document"}`}
          </h2>
          <button
            type="button"
            className="media-close"
            aria-label="Close media library"
            disabled={busy}
            onClick={dismiss}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="media-tabs" role="tablist" aria-label="Media source">
          {(eventId
            ? (["library"] as const)
            : (["library", "upload"] as const)
          ).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              data-media-tab={item}
              id={`${prefix}-${item}-tab`}
              aria-selected={tab === item}
              aria-label={item === "upload" ? `Upload ${noun}` : undefined}
              aria-controls={`${prefix}-${item}-panel`}
              tabIndex={tab === item ? 0 : -1}
              onKeyDown={tabsKey}
              onClick={() => changeTab(item)}
              disabled={busy}
            >
              {item === "library" ? "Media library" : `Upload ${noun}`}
              {item === "upload" && uploadDirty && (
                <span className="media-draft-mark">Unsaved</span>
              )}
            </button>
          ))}
        </div>
        <div className="media-dialog-content">
          <div
            className={`media-dialog-body${selected && !editing && !bulkMode ? " has-selection" : ""}`}
            role="tabpanel"
            id={`${prefix}-library-panel`}
            aria-labelledby={`${prefix}-library-tab`}
            hidden={tab !== "library"}
          >
            <section
              className="media-browser"
              aria-label={`Browse ${noun}s`}
              hidden={editing}
            >
              {error && (
                <Notice>
                  {error}{" "}
                  <button
                    type="button"
                    className="inline-button"
                    onClick={refresh}
                  >
                    Try again
                  </button>
                </Notice>
              )}
              {message && <Notice kind="success">{message}</Notice>}
              {!eventId && (
                <MediaBulkActions
                  bulk={bulk}
                  assets={filtered}
                  mode={bulkMode}
                  onMode={changeBulkMode}
                  disabled={
                    detailsBusy || uploadBusy || loading || Boolean(error)
                  }
                  description="Bulk selection manages library files. Your chosen file for insertion is kept."
                  active={tab === "library"}
                />
              )}
              <MediaFilters
                kind={kind}
                publicOnly={Boolean(eventId)}
                query={query}
                visibility={visibility}
                onQuery={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
                onVisibility={(value) => {
                  setVisibility(value);
                  setPage(1);
                }}
              />
              <div className="media-results-heading">
                <p className="media-result-count" role="status">
                  {loading
                    ? "Loading your library…"
                    : data
                      ? `${filtered.length} shown${data.total !== undefined ? ` of ${data.total} matching ${noun}s` : ` ${noun}s`}`
                      : error
                        ? "Library unavailable"
                        : "Loading your library…"}
                </p>
                {(query || visibility !== "all") && (
                  <button
                    type="button"
                    className="inline-button"
                    onClick={() => {
                      setQuery("");
                      setVisibility("all");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {data ? (
                <AssetGrid
                  emptyTitle={
                    kind === "image" ? "No images to show" : "No files to show"
                  }
                  assets={filtered}
                  onSelect={
                    bulkMode ? (asset) => bulk.toggle(asset, filtered) : choose
                  }
                  selectedId={bulkMode ? undefined : selectedId}
                  selectedIds={bulkMode ? bulk.selectedIds : undefined}
                  onToggle={
                    bulkMode
                      ? (asset, range) => bulk.toggle(asset, filtered, range)
                      : undefined
                  }
                  disabled={busy || loading || Boolean(error)}
                  emptyMessage={
                    query || visibility !== "all"
                      ? "Clear the filters or try a different search."
                      : eventId
                        ? "A club media manager can add public images to this collection."
                        : `Open Upload ${noun} to add your first ${noun}.`
                  }
                />
              ) : (
                !error && <Loading />
              )}
              {data?.total !== undefined && data.total > 48 && (
                <div className="media-pagination">
                  <button
                    type="button"
                    className="button button-outline button-small"
                    disabled={busy || loading || currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous page
                  </button>
                  <span>
                    Page {currentPage} of {Math.ceil(data.total / 48)}
                  </span>
                  <button
                    type="button"
                    className="button button-outline button-small"
                    disabled={busy || loading || currentPage * 48 >= data.total}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next page
                  </button>
                </div>
              )}
            </section>
            {selected && (
              <aside
                className="media-inspector"
                aria-label={`Selected ${noun}`}
                hidden={editing || bulkMode}
              >
                <div className="media-selected-image">
                  <MediaAssetThumbnail asset={selected} />
                </div>
                <div className="media-selected-copy">
                  <h3>{selected.title || selected.originalName}</h3>
                  <p className="media-file-facts">
                    {selected.width
                      ? `${selected.width} × ${selected.height} · `
                      : ""}
                    {mediaAssetSize(selected.size)}
                  </p>
                  <span
                    className={`media-badge media-badge-${selected.visibility}`}
                  >
                    {selected.visibility}
                  </span>
                  <p className="field-help">
                    {selected.visibility === "private"
                      ? "Available in private drafts. Make it public before publishing content that uses it."
                      : "Anyone with the file URL can view this file."}
                  </p>
                  {eventId ? (
                    <p className="field-help">
                      Club media managers maintain this collection.
                    </p>
                  ) : (
                    <button
                      ref={editTrigger}
                      type="button"
                      className="button button-outline button-small"
                      onClick={() => {
                        setEditorId(selected.id);
                        setEditing(true);
                      }}
                      disabled={busy}
                    >
                      <Icon name="edit" />
                      Edit {noun} details
                    </button>
                  )}
                </div>
              </aside>
            )}
            <section
              className="media-selected-editor"
              aria-label={`Edit selected ${noun}`}
              hidden={!editing}
            >
              <div className="media-editor-heading">
                <button
                  ref={editorBack}
                  type="button"
                  className="inline-button"
                  onClick={() => {
                    returnFromEditor.current = true;
                    setEditing(false);
                  }}
                  disabled={busy}
                >
                  <Icon name="back" />
                  Back to {noun}s
                </button>
                <h3>{kind === "image" ? "Image" : "File"} details</h3>
              </div>
              {selected && editorId === selected.id && !eventId && (
                <AssetDetails
                  key={selected.id}
                  asset={selected}
                  onDirty={setDetailsDirty}
                  onBusy={setDetailsBusy}
                  onChanged={(asset) => {
                    bulk.sync([asset]);
                    setSelectedId(asset.id);
                    setEditorId(asset.id);
                    setUpdatedAsset(asset);
                    refresh();
                  }}
                  onDeleted={() => {
                    bulk.forget([selected.id]);
                    setRemovedIds(
                      (current) => new Set([...current, selected.id]),
                    );
                    onRemoved(selected.id);
                    setSelectedId("");
                    setUpdatedAsset(undefined);
                    setDetailsDirty(false);
                    setEditing(false);
                    setEditorId(undefined);
                    setMessage("File deleted.");
                    refresh();
                  }}
                />
              )}
            </section>
          </div>
          {!eventId && (
            <section
              className="media-picker-upload"
              role="tabpanel"
              id={`${prefix}-upload-panel`}
              aria-labelledby={`${prefix}-upload-tab`}
              hidden={tab !== "upload"}
            >
              <MediaUpload
                kinds={[kind]}
                onDirty={setUploadDirty}
                onBusy={setUploadBusy}
                onUploaded={(asset) => {
                  insertAfterUpload.current = true;
                  setSelectedId(asset.id);
                  setUpdatedAsset(asset);
                  setTab("library");
                  setQuery("");
                  setVisibility("all");
                  setPage(1);
                  setMessage(
                    `File uploaded ${asset.visibility === "public" ? "publicly" : "privately"}. Select Insert ${noun} to use it.`,
                  );
                  refresh();
                }}
              />
            </section>
          )}
        </div>
        <footer className="media-dialog-footer">
          <div className="media-selection-summary" role="status">
            <strong>
              {tab === "upload"
                ? "Add to your media library"
                : selected?.title ||
                  selected?.originalName ||
                  `No ${noun} selected`}
            </strong>
            <span>
              {tab === "upload"
                ? "New uploads are public by default. Choose Private when needed."
                : bulkMode
                  ? "Choose Done selecting to return to insertion."
                  : detailsDirty
                    ? `Save the ${noun} details to continue.`
                    : selected
                      ? `Insert adds this ${noun} to your current draft.`
                      : `Choose ${kind === "image" ? "an image" : "a file"} to use in your draft.`}
            </span>
          </div>
          <div className="media-footer-actions">
            <button
              type="button"
              className="button button-outline button-small"
              disabled={busy}
              onClick={dismiss}
            >
              Cancel
            </button>
            {tab === "library" && (
              <button
                ref={insertButton}
                type="button"
                className="button button-accent button-small"
                disabled={!selected || detailsDirty || busy || bulkMode}
                onClick={() => {
                  if (!selected || !canDiscard(uploadDirty)) return;
                  dialog.current?.close();
                  onInsert(selected);
                }}
              >
                {currentId ? `Replace ${noun}` : `Insert ${noun}`}
              </button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
