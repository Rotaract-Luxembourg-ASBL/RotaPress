"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type {
  AdminMediaAssetDto,
  MediaKind,
} from "@/features/media/media_schemas";
import { errorMessage, request } from "./api";
import {
  rememberUpload,
  savedUpload,
  uploadFile,
  uploadFormats,
  uploadExtensions,
  uploadKind,
  uploadProblem,
  type UploadSubmission,
} from "./media-upload-client";
import { Icon } from "./icon";
import { Notice } from "./primitives";

type UploadItem = {
  id: string;
  file: File;
  preview: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  submission?: UploadSubmission;
  kind: MediaKind;
  progress?: number;
  sessionId?: string;
  generation?: string;
};

export function MediaUpload({
  onUploaded,
  onBusy,
  onDirty,
  onCancel,
  multiple = false,
  kinds = ["image", "document", "audio", "video"],
}: {
  onUploaded: (asset: AdminMediaAssetDto) => void;
  onBusy?: (busy: boolean) => void;
  onDirty?: (dirty: boolean) => void;
  onCancel?: () => void;
  multiple?: boolean;
  kinds?: readonly MediaKind[];
}) {
  const imageOnly = kinds.length === 1 && kinds[0] === "image";
  const acceptedTypes = kinds.flatMap((kind) => [
    ...uploadFormats[kind],
    ...uploadExtensions[kind],
  ]);
  const uploadAbort = useRef<AbortController | null>(null);
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
      uploadAbort.current?.abort();
    };
  }, []);

  function chooseFiles(files: FileList | File[]) {
    if (busy || !files.length) return;
    const next = Array.from(files);
    if (!multiple && next.length > 1) {
      setError("Choose one file for this field.");
      return;
    }
    if (next.length + (multiple ? items.length : 0) > 100) {
      setError("Add up to 100 files at a time.");
      return;
    }
    const messages: string[] = [];
    const accepted = next.flatMap((file) => {
      if (
        multiple &&
        items.some(
          (item) =>
            item.file.name === file.name &&
            item.file.size === file.size &&
            item.file.lastModified === file.lastModified,
        )
      ) {
        messages.push(`${file.name}: this file is already in the queue.`);
        return [];
      }
      const problem = uploadProblem(file, kinds);
      const kind = uploadKind(file, kinds);
      if (problem || !kind) {
        messages.push(`${file.name}: ${problem}`);
        return [];
      }
      const preview = kind === "image" ? URL.createObjectURL(file) : "";
      if (preview) urls.current.add(preview);
      const previous = savedUpload(file);
      return [
        {
          id: previous?.requestId ?? crypto.randomUUID(),
          file,
          preview,
          kind,
          submission: previous?.submission,
          sessionId: previous?.sessionId,
          generation:
            previous?.generation ?? document.body.dataset.contentGeneration,
          status: previous ? ("error" as const) : ("queued" as const),
          error: previous
            ? "Interrupted upload found. Resume to keep the completed chunks."
            : undefined,
        },
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

  async function remove(id: string) {
    if (!multiple && input.current) input.current.value = "";
    const next = items.filter((item) => item.id !== id);
    const item = items.find((entry) => entry.id === id);
    if (item) {
      const sessionId = item.sessionId ?? savedUpload(item.file)?.sessionId;
      if (sessionId && item.status !== "done") {
        try {
          await request(`/api/admin/media/uploads/${sessionId}`, {
            method: "DELETE",
          });
        } catch (cause) {
          setError(errorMessage(cause));
          return;
        }
      }
      rememberUpload(item.file);
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
    const controller = new AbortController();
    uploadAbort.current = controller;
    async function worker() {
      while (cursor < pending.length && !controller.signal.aborted) {
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
        try {
          const result = await uploadFile(
            item.file,
            item.kind,
            { requestId: item.id, submission, generation: item.generation },
            controller.signal,
            (progress, sessionId) => update(item.id, { progress, sessionId }),
          );
          update(item.id, { status: "done" });
          onUploaded(result);
        } catch (cause) {
          failed++;
          update(item.id, {
            status: "error",
            error: controller.signal.aborted
              ? "Upload paused. Resume when you are ready."
              : errorMessage(cause),
          });
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
      onDirty?.(failed > 0 || cursor < pending.length);
      uploadAbort.current = null;
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
        aria-label={imageOnly ? "Image file" : "Media file"}
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
            {multiple ? "Drop files to upload" : "Drop a file here"}
          </strong>
          <p className="field-help" id={`${helpId}-formats`}>
            {imageOnly
              ? "PNG, JPEG or WebP · Up to 5 MiB and 20 megapixels per image"
              : "Images 5 MiB · PDF 25 MiB · MP3/M4A 100 MiB · MP4/WebM 500 MiB"}
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
              {item.kind === "image" ? (
                <Image
                  src={item.preview}
                  alt="Selected upload preview"
                  width={72}
                  height={60}
                  unoptimized
                />
              ) : (
                <span className="media-upload-mark" aria-label={item.kind}>
                  <Icon name="image" />
                </span>
              )}
              <div>
                <strong>{item.file.name}</strong>
                <span>
                  {Math.max(1, Math.ceil(item.file.size / 1024))} KB ·{" "}
                  {item.status === "queued"
                    ? "Ready to upload"
                    : item.status === "uploading"
                      ? item.progress === 99
                        ? "Checking file…"
                        : `Uploading ${item.progress ?? 0}%`
                      : item.status === "done"
                        ? "Uploaded"
                        : "Upload failed"}
                </span>
                {item.error && <p role="alert">{item.error}</p>}
                {item.status === "uploading" && (
                  <progress
                    value={item.progress ?? 0}
                    max={100}
                    aria-label={`Upload progress for ${item.file.name}`}
                  />
                )}
              </div>
              {item.status === "done" ? (
                <Icon name="check" />
              ) : (
                <button
                  type="button"
                  className="media-close"
                  aria-label={`Remove ${item.file.name} from queue`}
                  onClick={() => void remove(item.id)}
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
          {pending[0].kind === "image" && (
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
                A short description for people who cannot see it. Leave empty
                for a decorative image.
              </p>
            </div>
          )}
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
              <option value="public">Public — anyone with the file URL</option>
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
              ? "New uploads are public by default. Choose Private for files only staff should see."
              : "These uploads will be private. You can change their visibility in the library."}
          </p>
        </div>
      )}
      {retrying && (
        <p className="field-help">
          Retry keeps the original upload details and avoids creating duplicate
          files. Remove a failed file and add it again to change its details. To
          resume after reloading, select the same file again in this tab.
        </p>
      )}
      <div className="media-upload-actions">
        {busy && (
          <button
            className="button button-outline"
            type="button"
            onClick={() => uploadAbort.current?.abort()}
          >
            Pause uploads
          </button>
        )}
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
              ? "Uploading files…"
              : pending.some((item) => item.status === "error")
                ? "Retry failed uploads"
                : multiple
                  ? `Upload ${pending.length || ""} ${pending.length === 1 ? "file" : "files"}`
                  : `Upload ${visibility} ${imageOnly ? "image" : "file"}`}
          </button>
        )}
      </div>
      {items.length > 0 && (
        <p className="field-help" role="status">
          {done} of {items.length} files uploaded
          {busy ? ". Uploading and checking your files…" : "."}
        </p>
      )}
    </form>
  );
}
