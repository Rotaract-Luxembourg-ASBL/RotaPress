"use client";

import { useId, useState } from "react";
import type { AdminMediaAssetDto } from "@/features/media/media_schemas";
import { useResource } from "./api";
import { Loading, Notice, PageHeading } from "./primitives";
import { AssetDetails, MediaUpload, canDiscard } from "./media-editors";
import {
  AssetGrid,
  type MediaSort,
  type VisibilityFilter,
} from "./media-browser";
import { MediaAttachmentDialog } from "./media-attachment-dialog";
import { MediaBulkActions, useMediaBulkActions } from "./media-bulk-actions";
import { useMediaCollection } from "./media-resource";
import { Icon } from "./icon";
import { CollectionToolbar, FilterTabs } from "./collection";

export { AssetGrid } from "./media-browser";
export { MediaPicker } from "./media-picker";
export { MediaUpload } from "./media-editors";

export function MediaLibrary({ requestedId }: { requestedId?: string }) {
  const prefix = useId();
  const [selection, setSelected] = useState<AdminMediaAssetDto>();
  const [requestedOpen, setRequestedOpen] = useState(Boolean(requestedId));
  const linked = useResource<{ asset: AdminMediaAssetDto }>(
    requestedId && requestedOpen
      ? `/api/admin/media/${encodeURIComponent(requestedId)}`
      : null,
  );
  const selected =
    selection ?? (requestedOpen ? linked.data?.asset : undefined);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [collection, setCollection] = useState("");
  const [sort, setSort] = useState<MediaSort>("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [moreFilters, setMoreFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [message, setMessage] = useState("");
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "48",
    search: query,
    visibility,
    collection,
    sort,
  });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const { data, error, loading, refresh } = useMediaCollection(
    `/api/admin/media?${params}`,
  );
  const assets = data?.assets ?? [];
  const bulk = useMediaBulkActions({
    enabled: true,
    onUpdated: (updated) => {
      const asset = updated.find((item) => item.id === selected?.id);
      if (asset) setSelected(asset);
    },
    onDeleted: (ids) => {
      if (selected && ids.includes(selected.id)) close();
    },
    onRefresh: refresh,
    onCompleted: () => setBulkMode(false),
  });
  const batchBusy = bulk.busy;
  const currentPage = data?.page ?? page;
  const selectedIndex = assets.findIndex((asset) => asset.id === selected?.id);
  const selectedIds = bulk.selectedIds;
  const filtered = Boolean(
    query || visibility !== "all" || collection || dateFrom || dateTo,
  );

  function close() {
    setRequestedOpen(false);
    setSelected(undefined);
    setUploading(false);
    setDirty(false);
  }
  function navigate(asset: AdminMediaAssetDto) {
    if (busy || !canDiscard(dirty)) return;
    setSelected(asset);
    setRequestedOpen(false);
    setDirty(false);
  }
  function toggle(asset: AdminMediaAssetDto, range: boolean) {
    setBulkMode(true);
    bulk.toggle(asset, assets, range);
  }
  function changeBulkMode(next: boolean) {
    if (busy || batchBusy) return;
    if (!next) bulk.clear();
    setBulkMode(next);
  }

  return (
    <>
      <PageHeading
        title="Media library"
        description="Upload, organize and reuse your images. New uploads are public by default."
      >
        <button
          className="button button-accent"
          onClick={() => setUploading(true)}
        >
          <Icon name="plus" />
          Upload image
        </button>
      </PageHeading>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {message && <Notice kind="success">{message}</Notice>}
      {requestedOpen && linked.error && (
        <Notice>
          {linked.error}{" "}
          <button className="inline-button" onClick={linked.refresh}>
            Try again
          </button>
        </Notice>
      )}
      {requestedOpen && !linked.data && !linked.error && <Loading />}
      <section
        className="admin-collection media-collection"
        aria-label="Your media"
        aria-busy={loading || batchBusy}
      >
        <div className="admin-collection-toolbar">
          <FilterTabs
            label="Media visibility"
            value={visibility}
            onChange={(value) => {
              setVisibility(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All images", count: data?.counts.all },
              { value: "public", label: "Public", count: data?.counts.public },
              {
                value: "private",
                label: "Private",
                count: data?.counts.private,
              },
            ]}
          />
          <CollectionToolbar
            searchLabel="Search media"
            query={query}
            onQuery={(value) => {
              setQuery(value);
              setPage(1);
            }}
          >
            <div className="media-view-toggle" aria-label="Display images">
              <button
                type="button"
                className="media-close"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <Icon name="overview" />
              </button>
              <button
                type="button"
                className="media-close"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <Icon name="outline" />
              </button>
            </div>
          </CollectionToolbar>
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
                {data?.collections.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="media-select-field">
              <label htmlFor={`${prefix}-sort`}>Sort images</label>
              <select
                id={`${prefix}-sort`}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as MediaSort);
                  setPage(1);
                }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </div>
            <button
              type="button"
              className="button button-outline button-small"
              aria-expanded={moreFilters}
              onClick={() => setMoreFilters(!moreFilters)}
            >
              More filters{dateFrom || dateTo ? " · Date selected" : ""}
            </button>
            {filtered && (
              <button
                type="button"
                className="inline-button"
                onClick={() => {
                  setQuery("");
                  setVisibility("all");
                  setCollection("");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          {moreFilters && (
            <div className="media-library-filters">
              <label>
                Uploaded from
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                Uploaded until
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </div>
          )}
        </div>
        <MediaBulkActions
          bulk={bulk}
          assets={assets}
          mode={bulkMode}
          onMode={changeBulkMode}
          disabled={loading || busy || Boolean(error)}
        />
        <div className="admin-collection-body">
          {loading && (
            <p className="media-result-count" role="status">
              Loading images…
            </p>
          )}
          {data && (
            <>
              <p className="media-result-count" role="status">
                {assets.length
                  ? `${(currentPage - 1) * data.pageSize + 1}–${(currentPage - 1) * data.pageSize + assets.length}`
                  : "0"}{" "}
                of {data.total} matching images · {data.counts.all} in your
                library
              </p>
              <AssetGrid
                assets={assets}
                selectedIds={selectedIds}
                onToggle={(asset, range) =>
                  toggle(asset as AdminMediaAssetDto, range)
                }
                onSelect={(asset) =>
                  bulkMode
                    ? bulk.toggle(asset, assets)
                    : navigate(asset as AdminMediaAssetDto)
                }
                onEdit={(asset) => navigate(asset as AdminMediaAssetDto)}
                disabled={loading || batchBusy}
                view={view}
                emptyMessage={
                  filtered
                    ? "Clear the filters or try a different search."
                    : "Choose Upload image to add your first images."
                }
              />
              <div className="media-pagination">
                <button
                  className="button button-outline button-small"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous page
                </button>
                <span>
                  Page {currentPage} of{" "}
                  {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                <button
                  className="button button-outline button-small"
                  disabled={
                    currentPage * data.pageSize >= data.total || loading
                  }
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next page
                </button>
              </div>
            </>
          )}
        </div>
      </section>
      {(uploading || selected) && (
        <MediaAttachmentDialog
          title={selected ? "Image details" : "Upload images"}
          onClose={close}
          canClose={() => !busy && canDiscard(dirty)}
          busy={busy}
          position={
            selected && selectedIndex >= 0
              ? `${selectedIndex + 1} of ${assets.length} on this page`
              : undefined
          }
          onPrevious={
            selectedIndex > 0
              ? () => navigate(assets[selectedIndex - 1])
              : undefined
          }
          onNext={
            selectedIndex >= 0 && selectedIndex < assets.length - 1
              ? () => navigate(assets[selectedIndex + 1])
              : undefined
          }
        >
          {selected ? (
            <AssetDetails
              key={selected.id}
              asset={selected}
              onDirty={setDirty}
              onBusy={setBusy}
              onChanged={(asset) => {
                setSelected(asset);
                bulk.sync([asset]);
                refresh();
              }}
              onDeleted={() => {
                bulk.forget([selected.id]);
                close();
                refresh();
                setMessage("Image deleted.");
              }}
            />
          ) : (
            <MediaUpload
              multiple
              onDirty={setDirty}
              onBusy={setBusy}
              onCancel={() => {
                if (!busy && canDiscard(dirty)) close();
              }}
              onUploaded={() => {
                refresh();
                setMessage("Images added to your library.");
              }}
            />
          )}
        </MediaAttachmentDialog>
      )}
    </>
  );
}
