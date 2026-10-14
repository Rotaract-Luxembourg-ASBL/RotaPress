"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { AdminMediaAssetDto } from "@/features/media/media_schemas";
import { errorMessage } from "./api";
import { Icon } from "./icon";
import { Notice } from "./primitives";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
type Submission = {
  title: string;
  alt: string;
  collection: string;
  visibility: "public" | "private";
};
type UploadItem = {
  id: string;
  file: File;
  preview: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  submission?: Submission;
};

export function MediaUpload({
  onUploaded,
  onBusy,
  onDirty,
  onCancel,
  multiple = false,
}: {
  onUploaded: (asset: AdminMediaAssetDto) => void;
  onBusy?: (busy: boolean) => void;
  onDirty?: (dirty: boolean) => void;
  onCancel?: () => void;
  multiple?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const helpId = useId();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [title, setTitle] = useState("");
  const [alt, setAlt] = useState("");
  const [collection, setCollection] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [items, setItems] = useState<UploadItem[]>([]);
  const pending = items.filter(
    (item) => item.status === "queued" || item.status === "error",
  );
  const done = items.filter((item) => item.status === "done").length;
  const retrying = pending.some((item) => item.status === "error");

  useEffect(() => {
    const previews = urls.current;
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
      previews.clear();
    };
  }, []);

  function chooseFiles(files: FileList | File[]) {
    if (busy || !files.length) return;
    const next = Array.from(files);
    if (!multiple && next.length > 1) {
      setError("Choose one image for this field.");
      return;
    }
    if (next.length + (multiple ? items.length : 0) > 100) {
      setError("Add up to 100 images at a time.");
      return;
    }
    const messages: string[] = [];
    const accepted = next.flatMap((file) => {
      if (!acceptedTypes.includes(file.type)) {
        messages.push(`${file.name}: choose a PNG, JPEG or WebP image.`);
        return [];
      }
      if (file.size > 5 * 1024 * 1024) {
        messages.push(`${file.name}: this image is over 5 MiB.`);
        return [];
      }
      const preview = URL.createObjectURL(file);
      urls.current.add(preview);
      return [
        { id: crypto.randomUUID(), file, preview, status: "queued" as const },
      ];
    });
    setError(messages.length ? messages.join(" ") : undefined);
    if (!accepted.length) return;
    if (!multiple) {
      items.forEach((item) => {
        URL.revokeObjectURL(item.preview);
        urls.current.delete(item.preview);
      });
      setTitle(accepted[0].file.name.replace(/\.[^.]+$/, "").slice(0, 160));
    }
    setItems((current) => (multiple ? [...current, ...accepted] : accepted));
    onDirty?.(true);
    if (multiple && input.current) input.current.value = "";
  }

  function update(id: string, changes: Partial<UploadItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  function remove(id: string) {
    if (!multiple && input.current) input.current.value = "";
    const next = items.filter((item) => item.id !== id);
    const item = items.find((entry) => entry.id === id);
    if (item) {
      URL.revokeObjectURL(item.preview);
      urls.current.delete(item.preview);
    }
    setItems(next);
    onDirty?.(next.some((entry) => entry.status !== "done"));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending.length || busy) return;
    setBusy(true);
    onBusy?.(true);
    setError(undefined);
    let failed = 0;
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        const submission = item.submission ?? {
          title: multiple
            ? item.file.name.replace(/\.[^.]+$/, "").slice(0, 160)
            : title,
          alt: multiple ? "" : alt,
          collection,
          visibility,
        };
        update(item.id, { status: "uploading", error: undefined, submission });
        const body = new FormData();
        body.set("file", item.file);
        body.set("requestId", item.id);
        for (const [key, value] of Object.entries(submission))
          body.set(key, value);
        try {
          const response = await fetch("/api/admin/media", {
            method: "POST",
            body,
          });
          const result: unknown = await response.json();
          if (!response.ok) {
            throw new Error(
              result &&
                typeof result === "object" &&
                "error" in result &&
                typeof result.error === "string"
                ? result.error
                : "Upload failed. Please try again.",
            );
          }
          update(item.id, { status: "done" });
          onUploaded(result as AdminMediaAssetDto);
        } catch (cause) {
          failed++;
          update(item.id, { status: "error", error: errorMessage(cause) });
        }
      }
    }
    try {
      await Promise.all(
        Array.from({ length: Math.min(2, pending.length) }, () => worker()),
      );
    } finally {
      setBusy(false);
      onBusy?.(false);
      onDirty?.(failed > 0);
    }
  }

  return (
    <form
      className="form-stack media-upload"
      onSubmit={upload}
      aria-busy={busy}
    >
      {error && <Notice>{error}</Notice>}
      <input
        ref={input}
        className="media-file-native"
        aria-label="Image file"
        aria-describedby={`${helpId}-formats`}
        type="file"
        accept={acceptedTypes.join(",")}
        multiple={multiple}
        tabIndex={-1}
        disabled={busy}
        onChange={(event) => {
          if (event.target.files) chooseFiles(event.target.files);
        }}
      />
      <div
        className={`media-upload-drop${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          chooseFiles(event.dataTransfer.files);
        }}
      >
        <span className="media-upload-mark">
          <Icon name="image" />
        </span>
        <div className="media-upload-file-copy">
          <strong>
            {multiple ? "Drop images to upload" : "Drop an image here"}
          </strong>
          <p className="field-help" id={`${helpId}-formats`}>
            PNG, JPEG or WebP · Up to 5 MiB and 20 megapixels per image
          </p>
          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            {multiple
              ? "Select files"
              : items.length
                ? "Change file"
                : "Choose file"}
          </button>
        </div>
      </div>
      {items.length > 0 && (
        <ul className="media-upload-queue" aria-label="Upload queue">
          {items.map((item) => (
            <li key={item.id} className={`media-upload-item is-${item.status}`}>
              <Image
                src={item.preview}
                alt="Selected upload preview"
                width={72}
                height={60}
                unoptimized
              />
              <div>
                <strong>{item.file.name}</strong>
                <span>
                  {Math.max(1, Math.ceil(item.file.size / 1024))} KB ·{" "}
                  {item.status === "queued"
                    ? "Ready to upload"
                    : item.status === "uploading"
                      ? "Uploading…"
                      : item.status === "done"
                        ? "Uploaded"
                        : "Upload failed"}
                </span>
                {item.error && <p role="alert">{item.error}</p>}
              </div>
              {item.status === "done" ? (
                <Icon name="check" />
              ) : (
                <button
                  type="button"
                  className="media-close"
                  aria-label={`Remove ${item.file.name} from queue`}
                  onClick={() => remove(item.id)}
                  disabled={busy}
                >
                  <Icon name="close" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!multiple && pending.length > 0 && (
        <div className="media-upload-fields">
          <label>
            Title
            <input
              name="title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                onDirty?.(true);
              }}
              maxLength={160}
              required
              disabled={busy || retrying}
            />
          </label>
          <div className="media-description-field">
            <label htmlFor={`${helpId}-alt`}>Alternative text</label>
            <input
              id={`${helpId}-alt`}
              name="alt"
              value={alt}
              onChange={(event) => {
                setAlt(event.target.value);
                onDirty?.(true);
              }}
              maxLength={300}
              disabled={busy || retrying}
              placeholder="Describe what the image communicates"
            />
            <p className="field-help">
              A short description for people who cannot see it. Leave empty for
              a decorative image.
            </p>
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="media-upload-fields media-upload-options">
          <div className="media-description-field">
            <label htmlFor={`${helpId}-visibility`}>Visibility</label>
            <select
              id={`${helpId}-visibility`}
              value={visibility}
              disabled={busy || retrying}
              onChange={(event) =>
                setVisibility(event.target.value as "public" | "private")
              }
            >
              <option value="public">Public — anyone with the image URL</option>
              <option value="private">Private — approved staff only</option>
            </select>
          </div>
          {multiple && (
            <label>
              Collection (optional)
              <input
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
                maxLength={80}
                disabled={busy || retrying}
              />
            </label>
          )}
          <p className="field-help">
            {visibility === "public"
              ? "New uploads are public by default. Choose Private for images only staff should see."
              : "These uploads will be private. You can change their visibility in the library."}
          </p>
        </div>
      )}
      {retrying && (
        <p className="field-help">
          Retry keeps the original upload details and avoids creating duplicate
          images. Remove a failed file and add it again to change its details.
        </p>
      )}
      <div className="media-upload-actions">
        {onCancel && (
          <button
            className="button button-outline"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            {done && !pending.length ? "Done" : "Cancel"}
          </button>
        )}
        {(!done || pending.length > 0) && (
          <button
            className="button button-accent"
            disabled={busy || !pending.length}
          >
            {busy
              ? "Uploading images…"
              : pending.some((item) => item.status === "error")
                ? "Retry failed uploads"
                : multiple
                  ? `Upload ${pending.length || ""} ${pending.length === 1 ? "image" : "images"}`
                  : `Upload ${visibility} image`}
          </button>
        )}
      </div>
      {items.length > 0 && (
        <p className="field-help" role="status">
          {done} of {items.length} images uploaded
          {busy ? ". Uploading and checking your images…" : "."}
        </p>
      )}
    </form>
  );
}
