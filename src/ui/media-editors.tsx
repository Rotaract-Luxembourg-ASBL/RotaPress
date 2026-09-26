"use client";

import Image from "next/image";
import { useId, useState, type FormEvent } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { errorMessage, request, useResource } from "./api";
import { Notice } from "./primitives";
export { MediaUpload } from "./media-upload";
export function canDiscard(dirty: boolean) {
  return (
    !dirty ||
    window.confirm(
      "Discard your unsaved image changes? Saved images and page content will not change.",
    )
  );
}

export function AssetDetails({
  asset,
  onChanged,
  onDeleted,
  onDirty,
  onBusy,
}: {
  asset: MediaAssetDto;
  onChanged: (asset: MediaAssetDto) => void;
  onDeleted: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const altId = useId();
  const [value, setValue] = useState(asset);
  const usage = useResource<{
    savedReferences: number;
    publishedReferences: number;
  }>(`/api/admin/media/${asset.id}`);
  const [tagsText, setTagsText] = useState(asset.tags.join(", "));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  function markDirty() {
    setDirty(true);
    setSaved(false);
    onDirty(true);
  }
  function working(next: boolean) {
    setBusy(next);
    onBusy(next);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    working(true);
    setError(undefined);
    try {
      const updated = await request<MediaAssetDto>(
        `/api/admin/media/${asset.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: value.title,
            alt: value.alt,
            caption: value.caption,
            tags: tagsText
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            collection: value.collection,
            visibility: value.visibility,
          }),
        },
      );
      setValue(updated);
      setTagsText(updated.tags.join(", "));
      setDirty(false);
      setSaved(true);
      onDirty(false);
      onChanged(updated);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      working(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete this image permanently? Images used by saved content or revision history cannot be deleted.",
      )
    )
      return;
    working(true);
    setError(undefined);
    try {
      await request(`/api/admin/media/${asset.id}`, { method: "DELETE" });
      onDirty(false);
      onDeleted();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      working(false);
    }
  }
  return (
    <form
      className="form-stack media-details"
      onSubmit={save}
      onChange={markDirty}
    >
      <div className="media-detail-overview">
        <Image
          className="media-detail-image"
          src={`/media/${asset.id}`}
          alt={value.alt}
          width={asset.width}
          height={asset.height}
          unoptimized
        />
        <div className="media-file-facts">
          <strong>{asset.originalName}</strong>
          <span>
            {asset.width} × {asset.height} · {Math.ceil(asset.size / 1024)} KB
          </span>
          <span className={`media-badge media-badge-${asset.visibility}`}>
            {asset.visibility}
          </span>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {saved && <Notice kind="success">Image details saved.</Notice>}
      <label>
        Title
        <input
          value={value.title}
          maxLength={160}
          disabled={busy}
          onChange={(event) =>
            setValue({ ...value, title: event.target.value })
          }
          required
        />
      </label>
      <div className="media-description-field">
        <label htmlFor={altId}>Alternative text</label>
        <textarea
          id={altId}
          aria-describedby={`${altId}-help`}
          rows={2}
          value={value.alt}
          maxLength={300}
          disabled={busy}
          onChange={(event) => setValue({ ...value, alt: event.target.value })}
        />
        <p className="field-help" id={`${altId}-help`}>
          A short description for people who cannot see the image.
        </p>
      </div>
      <label>
        Visibility
        <select
          value={value.visibility}
          disabled={busy}
          onChange={(event) =>
            setValue({
              ...value,
              visibility: event.target.value as "public" | "private",
            })
          }
        >
          <option value="private">Private — approved staff only</option>
          <option value="public">Public — anyone with the image URL</option>
        </select>
      </label>
      <p className="media-visibility-note">
        {value.visibility === "public"
          ? "Saving Public makes this file accessible to anyone with its URL, even before a page uses it. Public images can be published on your website."
          : "Private images are available to authorized staff and draft previews. Make an image public deliberately before publishing a page that uses it."}
      </p>
      {asset.visibility === "public" && value.visibility === "private" && (
        <p className="field-help">
          Making an image private cannot retrieve copies already downloaded.
          Images used on published pages cannot be made private.
        </p>
      )}
      <details className="media-extra-details">
        <summary>Caption, collection and tags</summary>
        <div className="form-stack">
          <label>
            Caption
            <textarea
              rows={2}
              value={value.caption}
              maxLength={1000}
              disabled={busy}
              onChange={(event) =>
                setValue({ ...value, caption: event.target.value })
              }
            />
          </label>
          <label>
            Collection
            <input
              value={value.collection}
              maxLength={80}
              disabled={busy}
              onChange={(event) =>
                setValue({ ...value, collection: event.target.value })
              }
            />
          </label>
          <label>
            Tags, separated by commas
            <input
              value={tagsText}
              disabled={busy}
              onChange={(event) => setTagsText(event.target.value)}
            />
          </label>
        </div>
      </details>
      <details className="media-extra-details">
        <summary>Where this image is used</summary>
        {usage.error ? (
          <Notice>
            {usage.error}{" "}
            <button
              type="button"
              className="inline-button"
              onClick={usage.refresh}
            >
              Retry usage check
            </button>
          </Notice>
        ) : usage.data ? (
          <div className="media-visibility-note">
            <p>
              {usage.data.publishedReferences} published references ·{" "}
              {usage.data.savedReferences} saved references
            </p>
            <p>
              Published references prevent making this image private. Saved
              content and retained revisions protect it from deletion. One page
              may have several references.
            </p>
          </div>
        ) : (
          <p role="status">Checking content references…</p>
        )}
      </details>
      <div className="media-detail-actions">
        <button
          className="button button-accent button-small"
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : "Save image details"}
        </button>
        <button
          type="button"
          className="inline-button media-delete"
          onClick={remove}
          disabled={busy}
        >
          Delete image
        </button>
      </div>
      {dirty && (
        <p className="field-help" role="status">
          Save image details before inserting or replacing this image.
        </p>
      )}
    </form>
  );
}
