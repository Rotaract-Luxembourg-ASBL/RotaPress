"use client";

import { useId } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { Icon } from "./icon";
import { MediaAssetThumbnail, mediaAssetSize } from "./media-asset-preview";
export type VisibilityFilter = "all" | "private" | "public";
export type MediaSort = "newest" | "oldest" | "title";

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
  kind = "image",
  publicOnly = false,
}: {
  query: string;
  visibility: VisibilityFilter;
  onQuery: (value: string) => void;
  onVisibility: (value: VisibilityFilter) => void;
  kind?: MediaAssetDto["kind"];
  publicOnly?: boolean;
}) {
  const prefix = useId();
  return (
    <div className="media-filters">
      <label className="media-search">
        Search media
        <input
          type="search"
          placeholder={
            publicOnly ? "Search public media" : "Search by title, filename or tag"
          }
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      {publicOnly ? (
        <p className="field-help">
          Public {kind === "image" ? "images" : "files"} only
        </p>
      ) : (
        <div className="media-description-field">
          <label htmlFor={`${prefix}-visibility`}>Visibility</label>
          <select
            id={`${prefix}-visibility`}
            value={visibility}
            onChange={(event) =>
              onVisibility(event.target.value as VisibilityFilter)
            }
          >
            <option value="all">
              All {kind === "image" ? "images" : "files"}
            </option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      )}
    </div>
  );
}

export function AssetGrid({
  assets,
  onSelect,
  selectedId,
  selectedIds,
  onToggle,
  onEdit,
  disabled,
  view = "grid",
  emptyMessage = "No images yet. Upload the first image for your club.",
  emptyTitle = "No images to show",
}: {
  assets: MediaAssetDto[];
  onSelect: (asset: MediaAssetDto) => void;
  selectedId?: string;
  selectedIds?: ReadonlySet<string>;
  onToggle?: (asset: MediaAssetDto, range: boolean) => void;
  onEdit?: (asset: MediaAssetDto) => void;
  disabled?: boolean;
  view?: "grid" | "list";
  emptyMessage?: string;
  emptyTitle?: string;
}) {
  return assets.length ? (
    <div className={`media-grid${view === "list" ? " media-list" : ""}`}>
      {assets.map((asset) => {
        const title = asset.title || asset.originalName;
        const checked = selectedIds?.has(asset.id) ?? selectedId === asset.id;
        return (
          <article
            key={asset.id}
            className={`media-tile${checked ? " is-selected" : ""}`}
          >
            {onToggle && (
              <label className="media-tile-checkbox" title={`Select ${title}`}>
                <input
                  type="checkbox"
                  aria-label={`Select ${title}`}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) =>
                    onToggle(
                      asset,
                      event.nativeEvent instanceof MouseEvent &&
                        event.nativeEvent.shiftKey,
                    )
                  }
                />
              </label>
            )}
            <button
              type="button"
              className="media-tile-open"
              disabled={disabled}
              onClick={() => onSelect(asset)}
              aria-label={`${onEdit ? "Open" : "Select"} ${title}`}
              aria-pressed={onToggle ? undefined : checked}
            >
              <span className="media-tile-image">
                <MediaAssetThumbnail asset={asset} />
                {!onToggle && checked && (
                  <span className="media-selection-check" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                )}
              </span>
              <span className="media-tile-title">{title}</span>
              <span className="media-tile-meta">
                <span className={`media-badge media-badge-${asset.visibility}`}>
                  {asset.visibility}
                </span>
                <span>
                  {asset.width
                    ? `${asset.width} × ${asset.height}`
                    : asset.kind === "document"
                      ? "PDF"
                      : asset.kind === "video"
                        ? "Video"
                        : "Audio"}
                </span>
              </span>
              {view === "list" && (
                <span className="media-list-facts">
                  {asset.collection || "No collection"} ·{" "}
                  {mediaAssetSize(asset.size)}
                </span>
              )}
            </button>
            {onEdit && (
              <button
                type="button"
                className="media-tile-edit inline-button"
                disabled={disabled}
                onClick={() => onEdit(asset)}
                aria-label={`Edit ${title}`}
              >
                <Icon name="edit" /> Edit
              </button>
            )}
          </article>
        );
      })}
    </div>
  ) : (
    <div className="media-empty">
      <Icon name="image" width={32} height={32} />
      <h3>{emptyTitle}</h3>
      <p>{emptyMessage}</p>
    </div>
  );
}
