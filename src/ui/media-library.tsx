"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AdminMediaAssetDto } from "@/features/media/media_schemas";
import { errorMessage, request, useResource } from "./api";
import { Loading, Notice, PageHeading } from "./primitives";
import { AssetDetails, MediaUpload, canDiscard } from "./media-editors";
import { AssetGrid, type MediaSort } from "./media-browser";
import { MediaAttachmentDialog } from "./media-attachment-dialog";
import { MediaBulkActions, useMediaBulkActions } from "./media-bulk-actions";
import { useMediaCollection, type MediaCollection } from "./media-resource";
import {
  useMediaLibraryLocation,
  type MediaKindFilter,
} from "./media-library-location";
import { Icon } from "./icon";
import { CollectionToolbar, FilterTabs } from "./collection";

export { AssetGrid } from "./media-browser";
export { MediaPicker } from "./media-picker";
export { MediaUpload } from "./media-editors";

export function MediaLibrary({ requestedId }: { requestedId?: string }) {
  const location = useSearchParams();
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
  const {
    query,
    setQuery,
    kind,
    setKind,
    visibility,
    setVisibility,
    collection,
    setCollection,
    sort,
    setSort,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    page,
    setPage,
    view,
    setView,
  } = useMediaLibraryLocation();
  const [moreFilters, setMoreFilters] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [message, setMessage] = useState("");
  const [navigationError, setNavigationError] = useState("");
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "48",
    search: query,
    visibility,
    collection,
    sort,
    kind,
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
    query ||
    kind !== "all" ||
    visibility !== "all" ||
    collection ||
    dateFrom ||
    dateTo,
  );

  function close() {
    setRequestedOpen(false);
    setSelected(undefined);
    setUploading(false);
    setDirty(false);
    const next = new URL(window.location.href);
    next.searchParams.delete("asset");
    window.history.replaceState(null, "", `${next.pathname}${next.search}`);
  }
  function navigate(asset: AdminMediaAssetDto) {
    if (busy || !canDiscard(dirty)) return;
    setSelected(asset);
    setRequestedOpen(false);
    setDirty(false);
    setNavigationError("");
    rememberAsset(asset.id);
  }
  function rememberAsset(id: string) {
    const next = new URL(window.location.href);
    next.searchParams.set("asset", id);
    window.history.replaceState(null, "", `${next.pathname}${next.search}`);
  }
  async function adjacent(direction: -1 | 1) {
    if (busy || loading || !canDiscard(dirty)) return;
    const nextIndex = selectedIndex + direction;
    if (assets[nextIndex]) {
      setSelected(assets[nextIndex]);
      rememberAsset(assets[nextIndex].id);
      setDirty(false);
      return;
    }
    setBusy(true);
    setNavigationError("");
    try {
      const nextParams = new URLSearchParams(params);
      nextParams.set("page", String(currentPage + direction));
      const next = await request<MediaCollection>(
        `/api/admin/media?${nextParams}`,
      );
      const asset = direction === 1 ? next.assets[0] : next.assets.at(-1);
      if (!asset)
        throw new Error(
          "No more files match these filters. Close details to refresh the library.",
        );
      setPage(next.page);
      setSelected(asset);
      rememberAsset(asset.id);
      setRequestedOpen(false);
      setDirty(false);
    } catch (cause) {
      setNavigationError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
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
        description="Upload, organize and reuse photos, documents, audio and video. New uploads are public by default."
      >
        <Link
          href={`/admin/media/albums?returnTo=${encodeURIComponent(`/admin/media?${location}`)}`}
          className="button button-outline"
        >
          Photo albums
        </Link>
        <button
          className="button button-accent"
          onClick={() => setUploading(true)}
        >
          <Icon name="plus" />
          Upload files
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
              { value: "all", label: "All files", count: data?.counts.all },
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
            <div className="media-view-toggle" aria-label="Display files">
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
              <label htmlFor={`${prefix}-kind`}>File type</label>
              <select
                id={`${prefix}-kind`}
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as MediaKindFilter);
                  setPage(1);
                }}
              >
                <option value="all">All files</option>
                <option value="image">Images</option>
                <option value="document">PDF documents</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </div>
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
              <label htmlFor={`${prefix}-sort`}>Sort files</label>
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
                  setKind("all");
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
              Loading files…
            </p>
          )}
          {data && (
            <>
              <p className="media-result-count" role="status">
                {assets.length
                  ? `${(currentPage - 1) * data.pageSize + 1}–${(currentPage - 1) * data.pageSize + assets.length}`
                  : "0"}{" "}
                of {data.total} matching files · {data.counts.all} in your
                library
              </p>
              <AssetGrid
                emptyTitle="No files to show"
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
                    : "Choose Upload files to add your first media."
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
          title={
            selected
              ? selected.kind === "image"
                ? "Image details"
                : "File details"
              : "Upload files"
          }
          onClose={close}
          canClose={() => !busy && canDiscard(dirty)}
          busy={busy}
          position={
            selected && selectedIndex >= 0
              ? `${(currentPage - 1) * (data?.pageSize ?? 48) + selectedIndex + 1} of ${data?.total ?? assets.length}`
              : undefined
          }
          onPrevious={
            selectedIndex > 0 || (selectedIndex === 0 && currentPage > 1)
              ? () => void adjacent(-1)
              : undefined
          }
          onNext={
            selectedIndex >= 0 &&
            (selectedIndex < assets.length - 1 ||
              currentPage * (data?.pageSize ?? 48) < (data?.total ?? 0))
              ? () => void adjacent(1)
              : undefined
          }
        >
          {navigationError && <Notice>{navigationError}</Notice>}
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
                setMessage("File deleted.");
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
                setMessage("Files added to your library.");
              }}
            />
          )}
        </MediaAttachmentDialog>
      )}
    </>
  );
}
