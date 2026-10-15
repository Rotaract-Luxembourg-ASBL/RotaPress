"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { AdminMediaAssetDto } from "@/features/media/media_schemas";
import { errorMessage, request } from "./api";
import { Notice } from "./primitives";

type Crop = { left: number; top: number; width: number; height: number };
type Edit = {
  crop: Crop;
  rotate: 0 | 90 | 180 | 270;
  flipHorizontal: boolean;
  flipVertical: boolean;
  width: number;
};

export function MediaImageEditor({
  asset,
  onCreated,
  onBusy,
  onDirty,
  onCancel,
}: {
  asset: AdminMediaAssetDto;
  onCreated: (asset: AdminMediaAssetDto) => void;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onCancel: () => void;
}) {
  const initial: Edit = {
    crop: { left: 0, top: 0, width: asset.width, height: asset.height },
    rotate: 0,
    flipHorizontal: false,
    flipVertical: false,
    width: asset.width,
  };
  const [history, setHistory] = useState<Edit[]>([initial]);
  const [index, setIndex] = useState(0);
  const [dragCrop, setDragCrop] = useState<Crop>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const retry = useRef<{ fingerprint: string; requestId: string } | undefined>(
    undefined,
  );
  const prefix = useId();
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus();
  }, []);
  const saved = history[index];
  const edit = { ...saved, crop: dragCrop ?? saved.crop };
  const quarter = edit.rotate === 90 || edit.rotate === 270;
  const resultWidth = quarter ? edit.crop.height : edit.crop.width;
  const resultHeight = quarter ? edit.crop.width : edit.crop.height;
  const dirty = JSON.stringify(saved) !== JSON.stringify(initial);
  const rotation =
    edit.rotate === 90
      ? `translate(${edit.crop.height} 0) rotate(90)`
      : edit.rotate === 180
        ? `translate(${edit.crop.width} ${edit.crop.height}) rotate(180)`
        : edit.rotate === 270
          ? `translate(0 ${edit.crop.width}) rotate(270)`
          : "";
  const flips = `translate(${edit.flipHorizontal ? resultWidth : 0} ${edit.flipVertical ? resultHeight : 0}) scale(${edit.flipHorizontal ? -1 : 1} ${edit.flipVertical ? -1 : 1})`;

  function change(next: Edit) {
    if (busy) return;
    const maxWidth =
      next.rotate === 90 || next.rotate === 270
        ? next.crop.height
        : next.crop.width;
    next = { ...next, width: Math.min(next.width, maxWidth) };
    const past = history.slice(0, index + 1);
    const nextHistory =
      past.length >= 40 ? [initial, ...past.slice(-38), next] : [...past, next];
    setHistory(nextHistory);
    setIndex(nextHistory.length - 1);
    onDirty(JSON.stringify(next) !== JSON.stringify(initial));
    setError("");
  }

  function point(event: PointerEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    const source = matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        )
      : { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(asset.width - 1, Math.round(source.x))),
      y: Math.max(0, Math.min(asset.height - 1, Math.round(source.y))),
    };
  }

  function selection(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start) return;
    const end = point(event);
    const crop = {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.max(1, Math.abs(end.x - start.x)),
      height: Math.max(1, Math.abs(end.y - start.y)),
    };
    setDragCrop(crop);
    return crop;
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const fingerprint = JSON.stringify(saved);
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, requestId: crypto.randomUUID() };
      const created = await request<AdminMediaAssetDto>(
        `/api/admin/media/${asset.id}/edit`,
        {
          method: "POST",
          body: JSON.stringify({
            ...saved,
            requestId: retry.current.requestId,
            expectedRevision: asset.metadataRevision,
          }),
        },
      );
      onDirty(false);
      onCreated(created);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <section
      className="media-image-editor"
      aria-label="Image editor"
      aria-busy={busy}
    >
      <div className="media-editor-heading">
        <h3>Edit image</h3>
        <button
          type="button"
          className="inline-button"
          ref={back}
          onClick={onCancel}
          disabled={busy}
        >
          Back to details
        </button>
      </div>
      <p className="field-help">
        Drag over the original to crop, or enter crop coordinates. Save creates
        a copy in the library.
      </p>
      {error && <Notice>{error}</Notice>}
      <div className="media-transform-toolbar">
        <button
          type="button"
          className="button button-outline button-small"
          disabled={busy}
          onClick={() =>
            change({
              ...saved,
              rotate: ((saved.rotate + 270) % 360) as Edit["rotate"],
            })
          }
        >
          Rotate left
        </button>
        <button
          type="button"
          className="button button-outline button-small"
          disabled={busy}
          onClick={() =>
            change({
              ...saved,
              rotate: ((saved.rotate + 90) % 360) as Edit["rotate"],
            })
          }
        >
          Rotate right
        </button>
        <button
          type="button"
          className="button button-outline button-small"
          aria-pressed={edit.flipHorizontal}
          disabled={busy}
          onClick={() =>
            change({ ...saved, flipHorizontal: !saved.flipHorizontal })
          }
        >
          Flip horizontally
        </button>
        <button
          type="button"
          className="button button-outline button-small"
          aria-pressed={edit.flipVertical}
          disabled={busy}
          onClick={() =>
            change({ ...saved, flipVertical: !saved.flipVertical })
          }
        >
          Flip vertically
        </button>
        <button
          type="button"
          className="button button-outline button-small"
          disabled={busy || !index}
          onClick={() => {
            setIndex(index - 1);
            onDirty(
              JSON.stringify(history[index - 1]) !== JSON.stringify(initial),
            );
          }}
        >
          Undo image edit
        </button>
        <button
          type="button"
          className="button button-outline button-small"
          disabled={busy || index === history.length - 1}
          onClick={() => {
            setIndex(index + 1);
            onDirty(
              JSON.stringify(history[index + 1]) !== JSON.stringify(initial),
            );
          }}
        >
          Redo image edit
        </button>
        <button
          type="button"
          className="inline-button"
          disabled={busy || !dirty}
          onClick={() => {
            setHistory([initial]);
            setIndex(0);
            onDirty(false);
          }}
        >
          Reset edits
        </button>
      </div>
      <div className="media-transform-previews">
        <figure>
          <figcaption>Original and crop</figcaption>
          <svg
            className="media-crop-canvas"
            viewBox={`0 0 ${asset.width} ${asset.height}`}
            role="img"
            aria-label="Original image crop area"
            onPointerDown={(event) => {
              if (busy) return;
              event.preventDefault();
              drag.current = point(event);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => selection(event)}
            onPointerUp={(event) => {
              const crop = selection(event);
              drag.current = undefined;
              setDragCrop(undefined);
              if (crop) change({ ...saved, crop });
            }}
            onPointerCancel={() => {
              drag.current = undefined;
              setDragCrop(undefined);
            }}
          >
            <image
              href={`/media/${asset.id}`}
              width={asset.width}
              height={asset.height}
            />
            <rect
              x={edit.crop.left}
              y={edit.crop.top}
              width={edit.crop.width}
              height={edit.crop.height}
              fill="none"
              stroke="white"
              strokeWidth={Math.max(asset.width, asset.height) / 150}
            />
            <rect
              x={edit.crop.left}
              y={edit.crop.top}
              width={edit.crop.width}
              height={edit.crop.height}
              fill="none"
              stroke="#176b99"
              strokeWidth={Math.max(asset.width, asset.height) / 300}
              strokeDasharray={`${asset.width / 80} ${asset.width / 160}`}
            />
          </svg>
        </figure>
        <figure>
          <figcaption>Edited preview</figcaption>
          <svg
            className="media-edit-preview"
            viewBox={`0 0 ${resultWidth} ${resultHeight}`}
            role="img"
            aria-label="Edited image preview"
          >
            <g transform={`${flips} ${rotation}`}>
              <svg
                width={edit.crop.width}
                height={edit.crop.height}
                viewBox={`${edit.crop.left} ${edit.crop.top} ${edit.crop.width} ${edit.crop.height}`}
              >
                <image
                  href={`/media/${asset.id}`}
                  width={asset.width}
                  height={asset.height}
                />
              </svg>
            </g>
          </svg>
        </figure>
      </div>
      <fieldset disabled={busy} className="media-crop-fields">
        <legend>Crop in original pixels</legend>
        {(["left", "top", "width", "height"] as const).map((key) => (
          <label key={key} htmlFor={`${prefix}-${key}`}>
            {key === "left"
              ? "Crop left"
              : key === "top"
                ? "Crop top"
                : key === "width"
                  ? "Crop width"
                  : "Crop height"}
            <input
              id={`${prefix}-${key}`}
              type="number"
              min={key === "left" || key === "top" ? 0 : 1}
              max={
                key === "left" || key === "width" ? asset.width : asset.height
              }
              value={edit.crop[key]}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (
                  Number.isInteger(value) &&
                  value >= (key === "left" || key === "top" ? 0 : 1)
                )
                  change({ ...saved, crop: { ...saved.crop, [key]: value } });
              }}
            />
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${prefix}-resize`}>
        Resize width (pixels)
        <input
          id={`${prefix}-resize`}
          type="number"
          min={1}
          max={resultWidth}
          disabled={busy}
          value={edit.width}
          onChange={(event) => {
            const width = Number(event.target.value);
            if (width > 0 && Number.isInteger(width))
              change({ ...saved, width });
          }}
        />
      </label>
      <p className="field-help" role="status">
        Result: {Math.min(edit.width, resultWidth)} ×{" "}
        {Math.max(
          1,
          Math.round(
            (resultHeight * Math.min(edit.width, resultWidth)) / resultWidth,
          ),
        )}{" "}
        pixels. Original: {asset.width} × {asset.height} pixels.
      </p>
      <button
        type="button"
        className="button button-accent"
        disabled={busy || !dirty}
        onClick={save}
      >
        {busy ? "Saving edited copy…" : "Save edited copy"}
      </button>
    </section>
  );
}
