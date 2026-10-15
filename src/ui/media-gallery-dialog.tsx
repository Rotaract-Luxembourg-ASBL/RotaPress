"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  MAX_GALLERY_IMAGES,
  type GalleryItem,
} from "@/features/cms/gallery_items";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { templateImage } from "@/features/cms/kits/template_images";
import {
  AssetGrid,
  MediaFilters,
  filterAssets,
  type VisibilityFilter,
} from "./media-browser";
import { MediaUpload, canDiscard } from "./media-editors";
import { MediaGalleryItems, type GalleryDraft } from "./media-gallery-items";
import { useMediaResource } from "./media-resource";
import { MediaBulkActions, useMediaBulkActions } from "./media-bulk-actions";
import { useMediaPickerEvent } from "./media-picker-scope";
import { Loading, Notice } from "./primitives";
import { Icon } from "./icon";

type GalleryCollection = {
  assets: MediaAssetDto[];
  total?: number;
  page?: number;
  collections?: string[];
};
type GalleryTab = "library" | "upload" | "gallery";

export function MediaGalleryDialog({
  items,
  onInsert,
  onDismiss,
}: {
  items: GalleryItem[];
  onInsert: (items: GalleryItem[]) => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const eventId = useMediaPickerEvent();
  const prefix = useId();
  const [draft, setDraft] = useState<GalleryDraft[]>(() =>
    items.map((item) => ({
      ...item,
      key: crypto.randomUUID(),
      title: templateImage(item.assetId)?.title,
    })),
  );
  const [tab, setTab] = useState<GalleryTab>(
    items.length ? "gallery" : "library",
  );
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [collection, setCollection] = useState("");
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [uploadDirty, setUploadDirty] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [removedIds, setRemovedIds] = useState(new Set<string>());
  const [message, setMessage] = useState("");
  const [uploadedIds, setUploadedIds] = useState(new Set<string>());
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "48",
    search: query,
    visibility,
    collection,
  });
  const { data, error, loading, refresh } = useMediaResource<GalleryCollection>(
    eventId
      ? `/api/admin/events/${eventId}/media`
      : `/api/admin/media?${params}`,
  );
  const bulk = useMediaBulkActions({
    enabled: !eventId,
    onUpdated: (assets) => {
      const updates = new Map(assets.map((asset) => [asset.id, asset]));
      setDraft((current) =>
        current.map((item) => {
          const asset = updates.get(item.assetId);
          return asset
            ? {
                ...item,
                title: asset.title || asset.originalName,
                visibility: asset.visibility,
              }
            : item;
        }),
      );
    },
    onDeleted: (ids) => {
      setRemovedIds((current) => new Set([...current, ...ids]));
      if (draft.some((item) => ids.includes(item.assetId))) setDirty(true);
      setDraft((current) =>
        current.filter((item) => !ids.includes(item.assetId)),
      );
      setUploadedIds(
        (current) => new Set([...current].filter((id) => !ids.includes(id))),
      );
    },
    onRefresh: refresh,
  });
  const busy = uploadBusy || bulk.busy;
  const filtered = filterAssets(
    (data?.assets ?? []).filter((asset) => !removedIds.has(asset.id)),
    query,
    visibility,
  );
  const currentPage = data?.page ?? page;
  const selectedIds = new Set(draft.map((item) => item.assetId));
  const selectedUploads = [...uploadedIds].filter((id) =>
    selectedIds.has(id),
  ).length;
  const tabs: { id: GalleryTab; label: string }[] = [
    { id: "library", label: "Media library" },
    ...(!eventId ? [{ id: "upload" as const, label: "Upload images" }] : []),
    { id: "gallery", label: "Edit gallery" },
  ];

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function dismiss() {
    if (busy || !canDiscard(dirty || uploadDirty)) return;
    dialog.current?.close();
    onDismiss();
  }
  function choose(asset: MediaAssetDto) {
    if (busy || loading) return;
    if (selectedIds.has(asset.id)) {
      setDraft((current) =>
        current.filter((item) => item.assetId !== asset.id),
      );
      setDirty(true);
      return;
    }
    if (draft.length >= MAX_GALLERY_IMAGES) {
      setMessage(
        `A gallery can contain up to ${MAX_GALLERY_IMAGES} images. Remove an image to add another.`,
      );
      return;
    }
    setDraft((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        assetId: asset.id,
        title: asset.title || asset.originalName,
        alt: asset.alt.slice(0, 250),
        caption: asset.caption.slice(0, 250),
        visibility: asset.visibility,
      },
    ]);
    setDirty(true);
    setMessage("");
  }
  function selectShown() {
    const next = [...draft];
    for (const asset of filtered) {
      if (next.length >= MAX_GALLERY_IMAGES) break;
      if (!next.some((item) => item.assetId === asset.id))
        next.push({
          key: crypto.randomUUID(),
          assetId: asset.id,
          title: asset.title || asset.originalName,
          alt: asset.alt.slice(0, 250),
          caption: asset.caption.slice(0, 250),
          visibility: asset.visibility,
        });
    }
    if (next.length !== draft.length) {
      setDraft(next);
      setDirty(true);
    }
    if (next.length === MAX_GALLERY_IMAGES)
      setMessage(`Gallery limit reached: ${MAX_GALLERY_IMAGES} images.`);
  }
  function changeTab(next: GalleryTab) {
    if (busy) return;
    if (next !== tab && bulkMode) {
      bulk.clear();
      setBulkMode(false);
    }
    setTab(next);
  }
  function tabsKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    const current = tabs.findIndex((item) => item.id === tab);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    changeTab(tabs[next].id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(
        `[data-gallery-tab="${tabs[next].id}"]`,
      )
      ?.focus();
  }
  function insert() {
    if (busy || !canDiscard(uploadDirty)) return;
    dialog.current?.close();
    onInsert(
      draft.map(({ assetId, alt, caption }) => ({
        assetId,
        alt,
        ...(caption !== undefined ? { caption } : {}),
      })),
    );
  }

  return (
    <dialog
      ref={dialog}
      className="media-dialog media-gallery-dialog"
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
            {items.length ? "Edit gallery" : "Create gallery"}
          </h2>
          <button
            type="button"
            className="media-close"
            aria-label="Close gallery"
            disabled={busy}
            onClick={dismiss}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="media-tabs" role="tablist" aria-label="Gallery images">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-gallery-tab={item.id}
              id={`${prefix}-${item.id}-tab`}
              aria-selected={tab === item.id}
              aria-label={item.label}
              aria-controls={`${prefix}-${item.id}-panel`}
              tabIndex={tab === item.id ? 0 : -1}
              disabled={busy}
              onKeyDown={tabsKey}
              onClick={() => changeTab(item.id)}
            >
              {item.label}
              {item.id === "gallery"
                ? ` (${draft.length})`
                : item.id === "upload" && uploadDirty
                  ? " · Unsaved"
                  : ""}
            </button>
          ))}
        </div>
        <div className="media-dialog-content">
          <section
            className="media-gallery-panel media-gallery-library"
            role="tabpanel"
            id={`${prefix}-library-panel`}
            aria-labelledby={`${prefix}-library-tab`}
            hidden={tab !== "library"}
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
            {message && <Notice>{message}</Notice>}
            {!eventId && (
              <MediaBulkActions
                bulk={bulk}
                assets={filtered}
                mode={bulkMode}
                onMode={(next) => {
                  if (!busy) {
                    if (!next) bulk.clear();
                    setBulkMode(next);
                  }
                }}
                disabled={uploadBusy || loading || Boolean(error)}
                description="Bulk selection manages library images. Your gallery order, captions and alternative text are kept."
                active={tab === "library"}
              />
            )}
            <MediaFilters
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
            {!eventId && (
              <div className="media-library-filters">
                <div className="media-select-field">
                  <label htmlFor={`${prefix}-collection`}>Collection</label>
                  <select
                    id={`${prefix}-collection`}
                    value={collection}
                    onChange={(event) => {
                      setCollection(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All collections</option>
                    {data?.collections?.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="media-results-heading">
              <p className="media-result-count" role="status">
                {loading
                  ? "Loading images…"
                  : `${filtered.length} shown${data?.total !== undefined ? ` of ${data.total} matching images` : " images"}`}
              </p>
              {!bulkMode && (
                <button
                  type="button"
                  className="button button-outline button-small"
                  disabled={
                    busy ||
                    loading ||
                    !filtered.length ||
                    draft.length >= MAX_GALLERY_IMAGES
                  }
                  onClick={selectShown}
                >
                  Select all shown
                </button>
              )}
            </div>
            {(query || visibility !== "all" || collection) && (
              <button
                type="button"
                className="inline-button"
                onClick={() => {
                  setQuery("");
                  setVisibility("all");
                  setCollection("");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
            {data ? (
              <AssetGrid
                assets={filtered}
                onSelect={
                  bulkMode ? (asset) => bulk.toggle(asset, filtered) : choose
                }
                onToggle={
                  bulkMode
                    ? (asset, range) => bulk.toggle(asset, filtered, range)
                    : (asset) => choose(asset)
                }
                selectedIds={bulkMode ? bulk.selectedIds : selectedIds}
                disabled={busy || loading}
                emptyMessage={
                  eventId
                    ? "A club media manager can add public images to this collection."
                    : "Try another search or upload images."
                }
              />
            ) : (
              !error && <Loading />
            )}
            {!eventId && data?.total !== undefined && data.total > 48 && (
              <div className="media-pagination">
                <button
                  type="button"
                  className="button button-outline button-small"
                  disabled={loading || currentPage === 1}
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
                  disabled={loading || currentPage * 48 >= data.total}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next page
                </button>
              </div>
            )}
          </section>
          {!eventId && (
            <section
              className="media-gallery-panel media-picker-upload"
              role="tabpanel"
              id={`${prefix}-upload-panel`}
              aria-labelledby={`${prefix}-upload-tab`}
              hidden={tab !== "upload"}
            >
              <p className="field-help">
                Uploads are added to your library and selected for this gallery
                while space is available. A gallery can contain up to{" "}
                {MAX_GALLERY_IMAGES} images.
              </p>
              <MediaUpload
                multiple
                onBusy={setUploadBusy}
                onDirty={setUploadDirty}
                onUploaded={(asset) => {
                  setUploadedIds((current) => new Set([...current, asset.id]));
                  setDraft((current) =>
                    current.some((item) => item.assetId === asset.id) ||
                    current.length >= MAX_GALLERY_IMAGES
                      ? current
                      : [
                          ...current,
                          {
                            key: crypto.randomUUID(),
                            assetId: asset.id,
                            title: asset.title || asset.originalName,
                            alt: asset.alt.slice(0, 250),
                            caption: asset.caption.slice(0, 250),
                            visibility: asset.visibility,
                          },
                        ],
                  );
                  setDirty(true);
                  refresh();
                }}
              />
              {uploadedIds.size > 0 && (
                <p className="field-help" role="status">
                  {uploadedIds.size} images uploaded to your library;{" "}
                  {selectedUploads} selected for this gallery.{" "}
                  {uploadedIds.size - selectedUploads > 0
                    ? `${uploadedIds.size - selectedUploads} uploaded images remain in the library outside this gallery.`
                    : ""}
                </p>
              )}
            </section>
          )}
          <section
            className="media-gallery-panel"
            role="tabpanel"
            id={`${prefix}-gallery-panel`}
            aria-labelledby={`${prefix}-gallery-tab`}
            hidden={tab !== "gallery"}
          >
            <MediaGalleryItems
              items={draft}
              busy={busy}
              onChange={(next) => {
                setDraft(next);
                setDirty(true);
              }}
            />
          </section>
        </div>
        <footer className="media-dialog-footer">
          <div className="media-selection-summary" role="status">
            <strong>
              {draft.length} of {MAX_GALLERY_IMAGES} images selected
            </strong>
            <span>
              {bulkMode
                ? "Choose Done selecting to return to gallery insertion. "
                : ""}
              {dirty
                ? "Unsaved gallery changes."
                : "Your existing gallery is kept until you update it."}{" "}
              {uploadedIds.size > 0
                ? "Uploaded files remain in the library if you cancel."
                : eventId
                  ? "Only event-approved images are offered."
                  : "Private images must be made public before publishing a page."}
            </span>
          </div>
          <div className="media-footer-actions">
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={dismiss}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button-accent"
              disabled={busy || bulkMode || (!draft.length && !items.length)}
              onClick={insert}
            >
              {items.length ? "Update gallery" : "Insert gallery"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
