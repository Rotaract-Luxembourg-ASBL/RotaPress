"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { errorMessage } from "./api";
import { Icon } from "./icon";
import { Notice } from "./primitives";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];

export function MediaUpload({
  onUploaded,
  onBusy,
  onDirty,
  onCancel,
}: {
  onUploaded: (asset: MediaAssetDto) => void;
  onBusy?: (busy: boolean) => void;
  onDirty?: (dirty: boolean) => void;
  onCancel?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setPreview(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
    return () => {
      reader.abort();
      setPreview("");
    };
  }, [file]);

  function chooseFile(next?: File) {
    if (!next || busy) return;
    if (!acceptedTypes.includes(next.type)) {
      setError("Choose a PNG, JPEG or WebP image.");
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      setError(
        "This image is over 5 MiB. Choose a smaller image and try again.",
      );
      return;
    }
    setError(undefined);
    setFile(next);
    setTitle((current) =>
      !current || current === file?.name.replace(/\.[^.]+$/, "").slice(0, 160)
        ? next.name.replace(/\.[^.]+$/, "").slice(0, 160)
        : current,
    );
    onDirty?.(true);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set("file", file);
    setBusy(true);
    onBusy?.(true);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/media", {
        method: "POST",
        body,
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
      form.reset();
      setTitle("");
      setFile(undefined);
      onDirty?.(false);
      onUploaded(result as MediaAssetDto);
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
      {error && <Notice>{error}</Notice>}
      <input
        ref={input}
        className="media-file-native"
        aria-label="Image file"
        aria-describedby={`${helpId}-formats`}
        name="file"
        type="file"
        accept={acceptedTypes.join(",")}
        tabIndex={-1}
        disabled={busy}
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      <div
        className={`media-upload-drop${file ? " has-file" : ""}${dragging ? " is-dragging" : ""}`}
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
          if (event.dataTransfer.files.length > 1) {
            setError("Choose one image at a time.");
            return;
          }
          chooseFile(event.dataTransfer.files[0]);
        }}
      >
        {preview ? (
          <Image
            className="media-upload-thumbnail"
            src={preview}
            width={240}
            height={160}
            alt="Selected upload preview"
            unoptimized
          />
        ) : (
          <span className="media-upload-mark">
            <Icon name="image" />
          </span>
        )}
        <div className="media-upload-file-copy">
          <strong>{file ? file.name : "Drop an image here"}</strong>
          <p className="field-help" id={`${helpId}-formats`}>
            {file
              ? `${Math.max(1, Math.ceil(file.size / 1024))} KB · Ready to upload`
              : "PNG, JPEG or WebP · Up to 5 MiB and 20 megapixels"}
          </p>
          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            {file ? "Change file" : "Choose file"}
          </button>
        </div>
      </div>
      {file && (
        <div className="media-upload-fields">
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
          <div className="media-description-field">
            <label htmlFor={`${helpId}-alt-input`}>Alternative text</label>
            <input
              id={`${helpId}-alt-input`}
              name="alt"
              maxLength={300}
              disabled={busy}
              aria-describedby={`${helpId}-alt`}
              placeholder="Describe what the image communicates"
            />
            <p className="field-help" id={`${helpId}-alt`}>
              A short description for people who cannot see it. Leave empty for
              a decorative image.
            </p>
          </div>
        </div>
      )}
      <p className="media-upload-privacy">
        <span className="media-badge media-badge-private">Private</span>
        Only authorized staff can see new uploads. You choose when to make them
        public.
      </p>
      <div className="media-upload-actions">
        {onCancel && (
          <button
            className="button button-outline"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <button className="button button-accent" disabled={busy || !file}>
          {busy
            ? "Uploading image…"
            : error
              ? "Retry upload"
              : "Upload private image"}
        </button>
      </div>
      {busy && (
        <p className="field-help" role="status">
          Uploading and checking your image…
        </p>
      )}
    </form>
  );
}
