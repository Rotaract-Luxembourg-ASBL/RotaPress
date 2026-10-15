"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type {
  AdminMediaAssetDto,
  MediaAssetDto,
} from "@/features/media/media_schemas";
import { errorMessage, request, useResource } from "./api";
import { Loading, Notice } from "./primitives";
import { Icon } from "./icon";
import { MediaImageEditor } from "./media-image-editor";
export { MediaUpload } from "./media-upload";

export function canDiscard(dirty: boolean) {
  return (
    !dirty ||
    window.confirm(
      "Discard your unsaved image changes? Saved images and page content will not change.",
    )
  );
}

type DetailsProps = {
  asset: MediaAssetDto;
  onChanged: (asset: AdminMediaAssetDto) => void;
  onDeleted: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
};

export function AssetDetails(props: DetailsProps) {
  const hasRevision =
    "metadataRevision" in props.asset &&
    typeof props.asset.metadataRevision === "string";
  const detail = useResource<{ asset: AdminMediaAssetDto }>(
    hasRevision ? null : `/api/admin/media/${props.asset.id}`,
  );
  const asset = hasRevision
    ? (props.asset as AdminMediaAssetDto)
    : detail.data?.asset;
  if (!asset)
    return detail.error ? (
      <Notice>
        {detail.error}{" "}
        <button
          type="button"
          className="inline-button"
          onClick={detail.refresh}
        >
          Try again
        </button>
      </Notice>
    ) : (
      <Loading />
    );
  return <AssetDetailsEditor {...props} asset={asset} />;
}

function AssetDetailsEditor({
  asset,
  onChanged,
  onDeleted,
  onDirty,
  onBusy,
}: Omit<DetailsProps, "asset"> & { asset: AdminMediaAssetDto }) {
  const prefix = useId();
  const [value, setValue] = useState(asset);
  const [revision, setRevision] = useState(asset.metadataRevision);
  const usage = useResource<{
    asset: AdminMediaAssetDto;
    savedReferences: number;
    publishedReferences: number;
  }>(`/api/admin/media/${asset.id}`);
  const [tagsText, setTagsText] = useState(asset.tags.join(", "));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [imageDirty, setImageDirty] = useState(false);
  const editImageButton = useRef<HTMLButtonElement>(null);
  const returnFromImageEditor = useRef(false);
  const current = usage.data?.asset;
  useEffect(() => {
    if (!editing && returnFromImageEditor.current) {
      returnFromImageEditor.current = false;
      editImageButton.current?.focus();
    }
  }, [editing]);
  const fieldsDisabled = busy || !revision;
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
      const updated = await request<AdminMediaAssetDto>(
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
            expectedRevision: revision ?? current?.metadataRevision,
          }),
        },
      );
      setValue(updated);
      setRevision(updated.metadataRevision);
      setTagsText(updated.tags.join(", "));
      setDirty(false);
      setSaved(true);
      onDirty(false);
      onChanged(updated);
      usage.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      working(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        "Delete this image permanently? This cannot be undone. Images used by saved content or revision history cannot be deleted.",
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

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(
        new URL(`/media/${asset.id}`, window.location.origin).href,
      );
      setCopied(true);
    } catch {
      setError(
        "The image URL could not be copied. Select the file URL and copy it manually.",
      );
    }
  }

  if (editing && current)
    return (
      <MediaImageEditor
        asset={{ ...value, metadataRevision: revision }}
        onBusy={working}
        onDirty={(next) => {
          setImageDirty(next);
          onDirty(next);
        }}
        onCancel={() => {
          if (canDiscard(imageDirty)) {
            returnFromImageEditor.current = true;
            setEditing(false);
            setImageDirty(false);
            onDirty(false);
          }
        }}
        onCreated={(created) => {
          setEditing(false);
          setImageDirty(false);
          onDirty(false);
          onChanged(created);
        }}
      />
    );

  return (
    <form
      className="form-stack media-details"
      onSubmit={save}
      onChange={markDirty}
      aria-busy={busy}
    >
      <section className="media-attachment-preview" aria-label="Image preview">
        <Image
          className="media-detail-image"
          src={`/media/${asset.id}`}
          alt={value.alt}
          width={asset.width}
          height={asset.height}
          unoptimized
        />
        <div className="media-preview-actions">
          <button
            ref={editImageButton}
            type="button"
            className="button button-outline button-small"
            disabled={busy || dirty || !current}
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" /> Edit image
          </button>
          <a
            className="button button-outline button-small"
            href={`/media/${asset.id}`}
            download={asset.originalName}
          >
            Download image
          </a>
        </div>
        {dirty && (
          <p className="field-help">
            Save image details before editing the image.
          </p>
        )}
      </section>
      <div className="media-attachment-fields">
        <div className="media-file-facts">
          <strong>{asset.originalName}</strong>
          <span>Uploaded {new Date(asset.createdAt).toLocaleDateString()}</span>
          <span>
            WebP · {asset.width} × {asset.height} ·{" "}
            {Math.ceil(asset.size / 1024)} KB
          </span>
          <span className={`media-badge media-badge-${value.visibility}`}>
            {value.visibility}
          </span>
        </div>
        {error && <Notice>{error}</Notice>}
        {saved && <Notice kind="success">Image details saved.</Notice>}
        <label>
          Alternative text
          <textarea
            rows={2}
            value={value.alt}
            maxLength={300}
            disabled={fieldsDisabled}
            aria-describedby={`${prefix}-alt-help`}
            onChange={(event) =>
              setValue({ ...value, alt: event.target.value })
            }
          />
        </label>
        <p className="field-help" id={`${prefix}-alt-help`}>
          Describe what the image communicates. Leave empty for a decorative
          image.
        </p>
        <label>
          Title
          <input
            value={value.title}
            maxLength={160}
            disabled={fieldsDisabled}
            onChange={(event) =>
              setValue({ ...value, title: event.target.value })
            }
            required
          />
        </label>
        <label>
          Caption
          <textarea
            rows={2}
            value={value.caption}
            maxLength={1000}
            disabled={fieldsDisabled}
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
            disabled={fieldsDisabled}
            onChange={(event) =>
              setValue({ ...value, collection: event.target.value })
            }
          />
        </label>
        <label>
          Tags, separated by commas
          <input
            value={tagsText}
            disabled={fieldsDisabled}
            onChange={(event) => setTagsText(event.target.value)}
          />
        </label>
        <div className="media-description-field">
          <label htmlFor={`${prefix}-visibility`}>Visibility</label>
          <select
            id={`${prefix}-visibility`}
            value={value.visibility}
            disabled={fieldsDisabled}
            onChange={(event) =>
              setValue({
                ...value,
                visibility: event.target.value as "public" | "private",
              })
            }
          >
            <option value="public">Public — anyone with the image URL</option>
            <option value="private">Private — approved staff only</option>
          </select>
        </div>
        <p className="field-help">
          {value.visibility === "public"
            ? "Anyone with the file URL can view this image."
            : "Only authorized staff and private draft previews can view this image."}
        </p>
        {asset.visibility === "public" && value.visibility === "private" && (
          <p className="field-help">
            Images on published pages cannot be made private. Previously
            downloaded copies remain with their recipients.
          </p>
        )}
        <label>
          File URL
          <input
            readOnly
            value={
              typeof window === "undefined"
                ? `/media/${asset.id}`
                : new URL(`/media/${asset.id}`, window.location.origin).href
            }
            onFocus={(event) => event.target.select()}
          />
        </label>
        <button
          type="button"
          className="button button-outline button-small media-copy-url"
          onClick={copyUrl}
        >
          {copied ? "URL copied" : "Copy URL"}
        </button>
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
                Published references prevent hiding this image. Saved content
                and retained revisions protect it from deletion.
              </p>
            </div>
          ) : (
            <p role="status">Checking content references…</p>
          )}
        </details>
        <div className="media-detail-actions">
          <button
            className="button button-accent button-small"
            disabled={busy || !dirty || !current}
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
        <p className="field-help" role="status">
          {dirty
            ? "Unsaved changes. Save image details to keep your edits."
            : saved
              ? "All changes saved."
              : "Image details are saved."}
        </p>
      </div>
    </form>
  );
}
