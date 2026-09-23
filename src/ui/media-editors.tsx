"use client";

import Image from "next/image";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { errorMessage, request, useResource } from "./api";
import { Notice } from "./primitives";
export function canDiscard(dirty: boolean) {
  return (
    !dirty ||
    window.confirm(
      "Discard the unsaved image details? Your page content will not change.",
    )
  );
}

export function MediaUpload({
  onUploaded,
  onBusy,
  onDirty,
}: {
  onUploaded: (asset: MediaAssetDto) => void;
  onBusy?: (busy: boolean) => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const altHelpId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [title, setTitle] = useState("");
  const [filename, setFilename] = useState("");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return;
    if (file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () =>
      setPreview(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
    return () => {
      reader.abort();
      setPreview("");
    };
  }, [file]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    onBusy?.(true);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/media", {
        method: "POST",
        body: new FormData(form),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Upload failed. Please try again.";
        throw new Error(message);
      }
      onUploaded(result as MediaAssetDto);
      form.reset();
      setTitle("");
      setFilename("");
      setFile(undefined);
      onDirty?.(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <form
      className="form-stack media-upload"
      onSubmit={upload}
      onChange={() => onDirty?.(true)}
      aria-busy={busy}
    >
      <div>
        <h3>Add an image</h3>
        <p className="field-help">
          PNG, JPEG or WebP. Up to 5 MiB and 20 megapixels.
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      <label className="media-file-input">
        <span className="media-upload-mark" aria-hidden="true">
          ↑
        </span>
        <strong>{filename || "Choose an image from your computer"}</strong>
        <span className="field-help">
          New images start private. You decide when they become public.
        </span>
        <input
          aria-label="Image file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setFile(file);
            setFilename(file?.name ?? "");
            if (file && !title)
              setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 160));
          }}
        />
      </label>
      {preview && (
        <Image
          className="media-upload-preview"
          src={preview}
          width={480}
          height={240}
          alt="Selected upload preview"
          unoptimized
        />
      )}
      <label>
        Title
        <input
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          required
          disabled={busy}
        />
      </label>
      <label>
        Alternative text
        <input
          name="alt"
          maxLength={300}
          disabled={busy}
          aria-describedby={altHelpId}
        />
      </label>
      <p className="field-help" id={altHelpId}>
        Describe what the image communicates. Leave empty for a decorative
        image.
      </p>
      <button className="button button-accent" disabled={busy}>
        {busy
          ? "Uploading image…"
          : error
            ? "Retry upload"
            : "Upload private image"}
      </button>
      <span className="field-help" role="status">
        {busy ? "Uploading and checking your image…" : "One image at a time."}
      </span>
    </form>
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
          {asset.width} × {asset.height} · {Math.ceil(asset.size / 1024)} KB ·
          WebP
        </span>
      </div>
      {error && <Notice>{error}</Notice>}
      {saved && <Notice kind="success">Image details saved.</Notice>}
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
          <strong>Content references</strong>
          <p>
            {usage.data.publishedReferences} published ·{" "}
            {usage.data.savedReferences} saved or retained revision references.
          </p>
          <p>
            Saved references protect deletion; published references also prevent
            making this image private. These are references, not unique page
            counts.
          </p>
        </div>
      ) : (
        <p role="status">Checking content references…</p>
      )}
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
      <label>
        Alternative text
        <textarea
          rows={2}
          value={value.alt}
          maxLength={300}
          disabled={busy}
          onChange={(event) => setValue({ ...value, alt: event.target.value })}
        />
        <span className="field-help">
          A short description for people who cannot see the image.
        </span>
      </label>
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
        <summary>Collection and tags</summary>
        <div className="form-stack">
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
