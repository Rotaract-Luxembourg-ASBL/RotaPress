"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { useResource } from "./api";
import { Loading, Notice } from "./primitives";
import { useMediaPickerEvent } from "./media-picker-scope";
import { AssetDetails, MediaUpload, canDiscard } from "./media-editors";
import {
  cmsImageSource,
  templateImage,
} from "@/features/cms/kits/template_images";
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
  const eventId = useMediaPickerEvent();
  const tabPrefix = useId();
  const { data, error, refresh } = useResource<{ assets: MediaAssetDto[] }>(
    eventId ? `/api/admin/events/${eventId}/media` : "/api/admin/media",
  );
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [selectedId, setSelectedId] = useState(currentId);
  const [updatedAsset, setUpdatedAsset] = useState<MediaAssetDto>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected =
    updatedAsset?.id === selectedId
      ? updatedAsset
      : data?.assets.find((asset) => asset.id === selectedId);
  const assets =
    data?.assets.map((asset) =>
      asset.id === updatedAsset?.id ? updatedAsset : asset,
    ) ?? [];
  const filtered = filterAssets(assets, query, visibility);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function dismiss() {
    if (busy || !canDiscard(dirty)) return;
    dialog.current?.close();
    onDismiss();
  }
  function choose(asset: MediaAssetDto) {
    if (busy || asset.id === selectedId || !canDiscard(dirty)) return;
    setSelectedId(asset.id);
    setUpdatedAsset(asset);
    setDirty(false);
  }
  function tabsKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "library"
        : event.key === "End"
          ? "upload"
          : tab === "library"
            ? "upload"
            : "library";
    setTab(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-media-tab="${next}"]`)
      ?.focus();
  }
  return (
    <dialog
      ref={dialog}
      className="media-dialog"
      aria-labelledby={`${tabPrefix}-title`}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <div className="media-dialog-shell">
        <header className="media-dialog-header">
          <div>
            <p className="eyebrow">Your shared collection</p>
            <h2 id={`${tabPrefix}-title`}>
              {currentId ? "Replace image" : "Choose an image"}
            </h2>
          </div>
          <button
            type="button"
            className="media-close"
            aria-label="Close media library"
            disabled={busy}
            onClick={dismiss}
          >
            ×
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
              id={`${tabPrefix}-${item}-tab`}
              aria-selected={tab === item}
              aria-controls={`${tabPrefix}-panel`}
              tabIndex={tab === item ? 0 : -1}
              onKeyDown={tabsKey}
              onClick={() => setTab(item)}
            >
              {item === "library" ? "Media library" : "Upload image"}
            </button>
          ))}
        </div>
        <div className="media-dialog-body">
          <section
            className="media-browser"
            role="tabpanel"
            id={`${tabPrefix}-panel`}
            aria-labelledby={`${tabPrefix}-${tab}-tab`}
          >
            {error && <Notice>{error}</Notice>}
            {message && <Notice kind="success">{message}</Notice>}
            {tab === "library" ? (
              <>
                <MediaFilters
                  query={query}
                  visibility={visibility}
                  onQuery={setQuery}
                  onVisibility={setVisibility}
                />
                <p className="media-result-count" role="status">
                  {data
                    ? `${filtered.length} ${filtered.length === 1 ? "image" : "images"}`
                    : "Loading your library…"}
                </p>
                {data ? (
                  <AssetGrid
                    assets={filtered}
                    onSelect={choose}
                    selectedId={selectedId}
                    emptyMessage={
                      query || visibility !== "all"
                        ? "Try a different search or visibility filter."
                        : eventId
                          ? "A club media manager can add public images to this collection."
                          : "Open Upload image to add your first image."
                    }
                  />
                ) : (
                  <Loading />
                )}
              </>
            ) : (
              <MediaUpload
                onUploaded={(asset) => {
                  refresh();
                  choose(asset);
                  setTab("library");
                  setQuery("");
                  setVisibility("all");
                  setMessage(
                    "Image uploaded privately. Review its details, then insert it.",
                  );
                }}
              />
            )}
          </section>
          <aside
            className="media-inspector"
            aria-label="Selected image details"
          >
            <h3>Image details</h3>
            {selected && eventId ? (
              <div>
                <p>{selected.title}</p>
                <p>{selected.alt}</p>
                <p className="field-help">
                  Public club image. Club media managers maintain this
                  collection.
                </p>
              </div>
            ) : selected ? (
              <AssetDetails
                key={selected.id}
                asset={selected}
                onDirty={setDirty}
                onBusy={setBusy}
                onChanged={(asset) => {
                  setUpdatedAsset(asset);
                  refresh();
                }}
                onDeleted={() => {
                  onRemoved(selected.id);
                  setSelectedId("");
                  setUpdatedAsset(undefined);
                  refresh();
                }}
              />
            ) : (
              <p className="media-inspector-empty">
                Select an image to preview it, edit its description and choose
                who can see it.
              </p>
            )}
          </aside>
        </div>
        <footer className="media-dialog-footer">
          <div className="media-selection-summary">
            <strong>
              {selected?.title || selected?.originalName || "No image selected"}
            </strong>
            <span>
              {dirty
                ? "Save the image details to continue."
                : selected?.visibility === "private"
                  ? "Private image · suitable for a draft preview"
                  : selected
                    ? "Public image · available for publication"
                    : "Choose an image from the library or upload a new one."}
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
            <button
              type="button"
              className="button button-accent button-small"
              disabled={!selected || dirty || busy}
              onClick={() => {
                if (!selected) return;
                dialog.current?.close();
                onInsert(selected);
              }}
            >
              {currentId ? "Replace image" : "Insert image"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

export function MediaPicker({
  value,
  onChange,
  onSelect,
  label = "Choose image",
}: {
  value: string;
  onChange: (id: string) => void;
  onSelect?: (asset: MediaAssetDto) => void;
  label?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<MediaAssetDto>();
  const selected = chosen?.id === value ? chosen : undefined;
  const bundled = templateImage(value);
  const source = cmsImageSource(value);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className={`media-picker${value ? " has-image" : ""}`}>
      {source && (
        <div className="media-picker-preview">
          <Image
            src={source}
            alt={selected?.alt ?? bundled?.alt ?? "Selected image"}
            width={360}
            height={240}
            unoptimized
          />
          <span>
            {selected?.title ||
              (bundled ? `${bundled.title} · Template image` : "Current image")}
          </span>
        </div>
      )}
      <div className="media-picker-actions">
        <button
          ref={trigger}
          type="button"
          className="button button-outline button-small"
          onClick={() => setOpen(true)}
        >
          {value ? "Replace image" : label}
        </button>
        {value && (
          <button
            type="button"
            className="inline-button"
            onClick={() => {
              onChange("");
              setChosen(undefined);
            }}
          >
            Remove image
          </button>
        )}
      </div>
      {open &&
        createPortal(
          <MediaPickerDialog
            currentId={value}
            onDismiss={close}
            onRemoved={(id) => {
              if (id === value) {
                onChange("");
                setChosen(undefined);
              }
            }}
            onInsert={(asset) => {
              setChosen(asset);
              onChange(asset.id);
              onSelect?.(asset);
              close();
            }}
          />,
          document.body,
        )}
    </div>
  );
}
