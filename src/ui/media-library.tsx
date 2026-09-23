"use client";

import { useState } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { useResource } from "./api";
import { Loading, Notice, PageHeading } from "./primitives";
import { AssetDetails, MediaUpload, canDiscard } from "./media-editors";
import {
  AssetGrid,
  filterAssets,
  type VisibilityFilter,
} from "./media-browser";
import { Dialog } from "./dialog";
import { Icon } from "./icon";
import { CollectionToolbar, FilterTabs, SummaryStats } from "./collection";

export { AssetGrid } from "./media-browser";
export { MediaPicker } from "./media-picker";
export { MediaUpload } from "./media-editors";

export function MediaLibrary({ requestedId }: { requestedId?: string }) {
  const { data, error, refresh } = useResource<{ assets: MediaAssetDto[] }>(
    "/api/admin/media",
  );
  const [selection, setSelected] = useState<MediaAssetDto>();
  const [requestedOpen, setRequestedOpen] = useState(Boolean(requestedId));
  const linked = useResource<{ asset: MediaAssetDto }>(
    requestedId && requestedOpen
      ? `/api/admin/media/${encodeURIComponent(requestedId)}`
      : null,
  );
  const selected =
    selection ?? (requestedOpen ? linked.data?.asset : undefined);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const assets = filterAssets(data?.assets ?? [], query, visibility);
  function close() {
    setRequestedOpen(false);
    setSelected(undefined);
    setUploading(false);
    setDirty(false);
  }
  return (
    <>
      <PageHeading
        title="Media library"
        description="Find and reuse your images. Every upload starts private."
      >
        <button
          className="button button-accent"
          onClick={() => setUploading(true)}
        >
          <Icon name="plus" />
          Upload images
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
      {data && (
        <SummaryStats
          label="Media counts"
          items={[
            {
              label: "Images",
              value: data.assets.length,
              hint: "Your shared media library",
              icon: "image",
              onClick: () => setVisibility("all"),
              selected: visibility === "all",
            },
            {
              label: "Public",
              value: data.assets.filter(
                (asset) => asset.visibility === "public",
              ).length,
              hint: "Available for public content",
              icon: "check",
              onClick: () => setVisibility("public"),
              selected: visibility === "public",
            },
            {
              label: "Private",
              value: data.assets.filter(
                (asset) => asset.visibility === "private",
              ).length,
              hint: "Protected from public access",
              icon: "image",
              onClick: () => setVisibility("private"),
              selected: visibility === "private",
            },
          ]}
        />
      )}
      <section className="admin-collection" aria-label="Your media">
        <div className="admin-collection-toolbar">
          <FilterTabs
            label="Media visibility"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "all", label: "All images", count: data?.assets.length },
              {
                value: "public",
                label: "Public",
                count: data?.assets.filter(
                  (asset) => asset.visibility === "public",
                ).length,
              },
              {
                value: "private",
                label: "Private",
                count: data?.assets.filter(
                  (asset) => asset.visibility === "private",
                ).length,
              },
            ]}
          />
          <CollectionToolbar
            searchLabel="Search media"
            query={query}
            onQuery={setQuery}
          >
            {query && (
              <button
                className="button button-outline"
                onClick={() => setQuery("")}
              >
                Clear search
              </button>
            )}
          </CollectionToolbar>
        </div>
        <div className="admin-collection-body">
          {data ? (
            <>
              <p className="media-result-count" role="status">
                {assets.length} {assets.length === 1 ? "image" : "images"}
              </p>
              <AssetGrid
                assets={assets}
                onSelect={setSelected}
                emptyMessage={
                  query || visibility !== "all"
                    ? "Try a different search or visibility filter."
                    : "Choose Upload images to add your first private image."
                }
              />
            </>
          ) : (
            !error && <Loading />
          )}
        </div>
      </section>
      {(uploading || selected) && (
        <Dialog
          title={selected ? "Image details" : "Upload an image"}
          onClose={close}
          canClose={() => !busy && canDiscard(dirty)}
        >
          {selected ? (
            <AssetDetails
              key={selected.id}
              asset={selected}
              onDirty={setDirty}
              onBusy={setBusy}
              onChanged={(asset) => {
                setSelected(asset);
                refresh();
              }}
              onDeleted={() => {
                close();
                refresh();
                setMessage("Image deleted.");
              }}
            />
          ) : (
            <MediaUpload
              onDirty={setDirty}
              onBusy={setBusy}
              onUploaded={(asset) => {
                setSelected(asset);
                setUploading(false);
                setDirty(false);
                refresh();
                setMessage(
                  "Image uploaded privately. Review its details and visibility.",
                );
              }}
            />
          )}
        </Dialog>
      )}
    </>
  );
}
