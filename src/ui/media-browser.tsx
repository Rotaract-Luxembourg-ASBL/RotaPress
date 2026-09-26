"use client";

import Image from "next/image";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { Icon } from "./icon";
export type VisibilityFilter = "all" | "private" | "public";

export function filterAssets(
  assets: MediaAssetDto[],
  query: string,
  visibility: VisibilityFilter,
) {
  const search = query.trim().toLocaleLowerCase();
  return assets.filter(
    (asset) =>
      (visibility === "all" || asset.visibility === visibility) &&
      [
        asset.title,
        asset.originalName,
        asset.alt,
        asset.caption,
        asset.collection,
        ...asset.tags,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search),
  );
}

export function MediaFilters({
  query,
  visibility,
  onQuery,
  onVisibility,
}: {
  query: string;
  visibility: VisibilityFilter;
  onQuery: (value: string) => void;
  onVisibility: (value: VisibilityFilter) => void;
}) {
  return (
    <div className="media-filters">
      <label className="media-search">
        Search media
        <input
          type="search"
          placeholder="Search by title, filename or tag"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <label>
        Visibility
        <select
          value={visibility}
          onChange={(event) =>
            onVisibility(event.target.value as VisibilityFilter)
          }
        >
          <option value="all">All images</option>
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
      </label>
    </div>
  );
}

export function AssetGrid({
  assets,
  onSelect,
  selectedId,
  emptyMessage = "No images yet. Upload the first image for your club.",
}: {
  assets: MediaAssetDto[];
  onSelect: (asset: MediaAssetDto) => void;
  selectedId?: string;
  emptyMessage?: string;
}) {
  return assets.length ? (
    <div className="media-grid">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          className={`media-tile${selectedId === asset.id ? " is-selected" : ""}`}
          onClick={() => onSelect(asset)}
          aria-label={`Select ${asset.title || asset.originalName}`}
          aria-pressed={selectedId === asset.id}
        >
          <span className="media-tile-image">
            <Image
              src={`/media/${asset.id}`}
              alt=""
              width={240}
              height={180}
              unoptimized
            />
            {selectedId === asset.id && (
              <span className="media-selection-check" aria-hidden="true">
                <Icon name="check" />
              </span>
            )}
          </span>
          <span className="media-tile-title">
            {asset.title || asset.originalName}
          </span>
          <span className="media-tile-meta">
            <span className={`media-badge media-badge-${asset.visibility}`}>
              {asset.visibility}
            </span>
            <span>
              {asset.width} × {asset.height}
            </span>
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div className="media-empty">
      <Icon name="image" width={32} height={32} />
      <h3>No images to show</h3>
      <p>{emptyMessage}</p>
    </div>
  );
}
