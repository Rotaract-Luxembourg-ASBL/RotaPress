"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { useResource } from "./api";
import { Loading, Notice } from "./primitives";
import { Icon } from "./icon";
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
}: {
  currentId: string;
  onInsert: (asset: MediaAssetDto) => void;
  onDismiss: () => void;
  onRemoved: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const editorBack = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const insertButton = useRef<HTMLButtonElement>(null);
  const returnFromEditor = useRef(false);
  const insertAfterUpload = useRef(false);
  const eventId = useMediaPickerEvent();
  const prefix = useId();
  const { data, error, refresh } = useResource<{ assets: MediaAssetDto[] }>(
    eventId ? `/api/admin/events/${eventId}/media` : "/api/admin/media",
  );
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [selectedId, setSelectedId] = useState(currentId);
  const [updatedAsset, setUpdatedAsset] = useState<MediaAssetDto>();
  const [editorId, setEditorId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [uploadDirty, setUploadDirty] = useState(false);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [message, setMessage] = useState("");
  const busy = detailsBusy || uploadBusy;
  const selected =
    updatedAsset?.id === selectedId
      ? updatedAsset
      : data?.assets.find((asset) => asset.id === selectedId);
  const assets =
    data?.assets.map((asset) =>
      asset.id === updatedAsset?.id ? updatedAsset : asset,
    ) ?? [];
  if (updatedAsset && !assets.some((asset) => asset.id === updatedAsset.id))
    assets.unshift(updatedAsset);
  const filtered = filterAssets(assets, query, visibility);

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
    if (busy || asset.id === selectedId || !canDiscard(detailsDirty)) return;
    setSelectedId(asset.id);
    setUpdatedAsset(asset);
    setDetailsDirty(false);
    setEditorId(undefined);
    setEditing(false);
  }

  function changeTab(next: "library" | "upload") {
    if (busy || (next === "upload" && !canDiscard(detailsDirty))) return false;
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
        event.preventDefault();
        dismiss();
      }}
    >
      <div className="media-dialog-shell">
        <header className="media-dialog-header">
          <h2 id={`${prefix}-title`}>
            {currentId ? "Replace image" : "Choose an image"}
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
        <div className="media-tabs" role="tablist" aria-label="Image source">
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
              aria-label={item === "upload" ? "Upload image" : undefined}
              aria-controls={`${prefix}-${item}-panel`}
              tabIndex={tab === item ? 0 : -1}
              onKeyDown={tabsKey}
              onClick={() => changeTab(item)}
              disabled={busy}
            >
              {item === "library" ? "Media library" : "Upload image"}
              {item === "upload" && uploadDirty && (
                <span className="media-draft-mark">Unsaved</span>
              )}
            </button>
          ))}
        </div>
        <div className="media-dialog-content">
          <div
            className={`media-dialog-body${selected && !editing ? " has-selection" : ""}`}
            role="tabpanel"
            id={`${prefix}-library-panel`}
            aria-labelledby={`${prefix}-library-tab`}
            hidden={tab !== "library"}
          >
            <section
              className="media-browser"
              aria-label="Browse images"
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
              <MediaFilters
                query={query}
                visibility={visibility}
                onQuery={setQuery}
                onVisibility={setVisibility}
              />
              <div className="media-results-heading">
                <p className="media-result-count" role="status">
                  {data
                    ? `${filtered.length} ${filtered.length === 1 ? "image" : "images"}`
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
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {data ? (
                <AssetGrid
                  assets={filtered}
                  onSelect={choose}
                  selectedId={selectedId}
                  emptyMessage={
                    query || visibility !== "all"
                      ? "Clear the filters or try a different search."
                      : eventId
                        ? "A club media manager can add public images to this collection."
                        : "Open Upload image to add your first image."
                  }
                />
              ) : (
                !error && <Loading />
              )}
            </section>
            {selected && (
              <aside
                className="media-inspector"
                aria-label="Selected image"
                hidden={editing}
              >
                <Image
                  className="media-selected-image"
                  src={`/media/${selected.id}`}
                  alt={selected.alt}
                  width={selected.width}
                  height={selected.height}
                  unoptimized
                />
                <div className="media-selected-copy">
                  <h3>{selected.title || selected.originalName}</h3>
                  <p className="media-file-facts">
                    {selected.width} × {selected.height} ·{" "}
                    {Math.ceil(selected.size / 1024)} KB
                  </p>
                  <span
                    className={`media-badge media-badge-${selected.visibility}`}
                  >
                    {selected.visibility}
                  </span>
                  <p className="field-help">
                    {selected.visibility === "private"
                      ? "Available in private drafts. Make it public before publishing content that uses it."
                      : "Anyone with the image URL can view this file."}
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
                      Edit image details
                    </button>
                  )}
                </div>
              </aside>
            )}
            <section
              className="media-selected-editor"
              aria-label="Edit selected image"
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
                  Back to images
                </button>
                <h3>Image details</h3>
              </div>
              {selected && editorId === selected.id && !eventId && (
                <AssetDetails
                  key={selected.id}
                  asset={selected}
                  onDirty={setDetailsDirty}
                  onBusy={setDetailsBusy}
                  onChanged={(asset) => {
                    setUpdatedAsset(asset);
                    refresh();
                  }}
                  onDeleted={() => {
                    onRemoved(selected.id);
                    setSelectedId("");
                    setUpdatedAsset(undefined);
                    setDetailsDirty(false);
                    setEditing(false);
                    setEditorId(undefined);
                    setMessage("Image deleted.");
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
                onDirty={setUploadDirty}
                onBusy={setUploadBusy}
                onUploaded={(asset) => {
                  insertAfterUpload.current = true;
                  setSelectedId(asset.id);
                  setUpdatedAsset(asset);
                  setTab("library");
                  setQuery("");
                  setVisibility("all");
                  setMessage(
                    "Image uploaded privately. Select Insert image to use it.",
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
                  "No image selected"}
            </strong>
            <span>
              {tab === "upload"
                ? "Uploads stay private until you change their visibility."
                : detailsDirty
                  ? "Save the image details to continue."
                  : selected
                    ? "Insert adds this image to your current draft."
                    : "Choose an image to use in your draft."}
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
                disabled={!selected || detailsDirty || busy}
                onClick={() => {
                  if (!selected || !canDiscard(uploadDirty)) return;
                  dialog.current?.close();
                  onInsert(selected);
                }}
              >
                {currentId ? "Replace image" : "Insert image"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
