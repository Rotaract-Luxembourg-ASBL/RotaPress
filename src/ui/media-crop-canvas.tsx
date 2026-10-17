"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type MediaCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type Corner = "nw" | "ne" | "sw" | "se";
type Mode = Corner | "move" | "new";
type Bounds = { width: number; height: number };

export function constrainCrop(
  crop: MediaCrop,
  bounds: Bounds,
  ratio = 0,
): MediaCrop {
  const left = Math.round(Math.max(0, Math.min(bounds.width - 1, crop.left)));
  const top = Math.round(Math.max(0, Math.min(bounds.height - 1, crop.top)));
  let width = Math.max(1, Math.min(bounds.width - left, crop.width));
  let height = Math.max(1, Math.min(bounds.height - top, crop.height));
  if (ratio > 0) {
    height = width / ratio;
    if (height > bounds.height - top) {
      height = bounds.height - top;
      width = height * ratio;
    }
  }
  return {
    left,
    top,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function MediaCropCanvas({
  assetId,
  bounds,
  crop,
  ratio,
  zoom,
  disabled,
  onChange,
}: {
  assetId: string;
  bounds: Bounds;
  crop: MediaCrop;
  ratio: number;
  zoom: number;
  disabled: boolean;
  onChange: (crop: MediaCrop) => void;
}) {
  const drag = useRef<
    { start: { x: number; y: number }; crop: MediaCrop; mode: Mode } | undefined
  >(undefined);
  const [draft, setDraft] = useState<MediaCrop>();
  const shown = draft ?? crop;
  const handleSize = Math.max(bounds.width, bounds.height) / 35;

  function point(event: PointerEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    const result = matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(
          matrix.inverse(),
        )
      : { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(bounds.width, result.x)),
      y: Math.max(0, Math.min(bounds.height, result.y)),
    };
  }
  function resize(original: MediaCrop, mode: Corner, dx: number, dy: number) {
    const west = mode.includes("w");
    const north = mode.includes("n");
    const anchorX = west ? original.left + original.width : original.left;
    const anchorY = north ? original.top + original.height : original.top;
    let width = Math.max(1, original.width + (west ? -dx : dx));
    let height = Math.max(1, original.height + (north ? -dy : dy));
    if (ratio > 0) {
      if (Math.abs(dy) > Math.abs(dx)) width = height * ratio;
      else height = width / ratio;
    }
    const maxWidth = west ? anchorX : bounds.width - anchorX;
    const maxHeight = north ? anchorY : bounds.height - anchorY;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    return {
      left: west ? anchorX - width : anchorX,
      top: north ? anchorY - height : anchorY,
      width,
      height,
    };
  }
  function moved(original: MediaCrop, dx: number, dy: number): MediaCrop {
    return {
      ...original,
      left: Math.round(
        Math.max(
          0,
          Math.min(bounds.width - original.width, original.left + dx),
        ),
      ),
      top: Math.round(
        Math.max(
          0,
          Math.min(bounds.height - original.height, original.top + dy),
        ),
      ),
    };
  }
  function update(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active) return;
    const end = point(event);
    const dx = end.x - active.start.x;
    const dy = end.y - active.start.y;
    const next =
      active.mode === "move"
        ? moved(active.crop, dx, dy)
        : active.mode === "new"
          ? constrainCrop(
              {
                left: Math.min(active.start.x, end.x),
                top: Math.min(active.start.y, end.y),
                width: Math.max(1, Math.abs(dx)),
                height: Math.max(1, Math.abs(dy)),
              },
              bounds,
              ratio,
            )
          : resize(active.crop, active.mode, dx, dy);
    setDraft(next);
    return next;
  }
  function keyboard(event: KeyboardEvent<SVGElement>, mode: "move" | Corner) {
    if (
      disabled ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const dx =
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy =
      event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    onChange(
      mode === "move" ? moved(crop, dx, dy) : resize(crop, mode, dx, dy),
    );
  }
  const corners: { mode: Corner; x: number; y: number; label: string }[] = [
    { mode: "nw", x: shown.left, y: shown.top, label: "top left" },
    {
      mode: "ne",
      x: shown.left + shown.width,
      y: shown.top,
      label: "top right",
    },
    {
      mode: "sw",
      x: shown.left,
      y: shown.top + shown.height,
      label: "bottom left",
    },
    {
      mode: "se",
      x: shown.left + shown.width,
      y: shown.top + shown.height,
      label: "bottom right",
    },
  ];
  return (
    <div className="media-crop-viewport">
      <svg
        className="media-crop-canvas"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        style={{ width: `${zoom}%`, maxWidth: "none" }}
        role="group"
        aria-label="Original image crop area"
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          const target =
            event.target instanceof SVGElement
              ? event.target.closest("[data-crop-mode]")
              : null;
          const mode = (target?.getAttribute("data-crop-mode") ??
            "new") as Mode;
          drag.current = { start: point(event), crop, mode };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={update}
        onPointerUp={(event) => {
          const active = drag.current;
          if (!active) return;
          const end = point(event);
          const movedEnough =
            Math.abs(end.x - active.start.x) +
              Math.abs(end.y - active.start.y) >
            1;
          const next = movedEnough ? update(event) : undefined;
          drag.current = undefined;
          setDraft(undefined);
          if (next) onChange(next);
        }}
        onPointerCancel={() => {
          drag.current = undefined;
          setDraft(undefined);
        }}
      >
        <image
          href={`/media/${assetId}`}
          width={bounds.width}
          height={bounds.height}
        />
        <path
          fill="#0008"
          fillRule="evenodd"
          pointerEvents="none"
          d={`M0 0H${bounds.width}V${bounds.height}H0Z M${shown.left} ${shown.top}v${shown.height}h${shown.width}v-${shown.height}Z`}
        />
        <rect
          x={shown.left}
          y={shown.top}
          width={shown.width}
          height={shown.height}
          className="media-crop-selection"
          data-crop-mode="move"
          fill="transparent"
          stroke="white"
          strokeWidth={handleSize / 12}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Move crop selection with arrow keys"
          onKeyDown={(event) => keyboard(event, "move")}
        />
        {corners.map((corner) => (
          <rect
            key={corner.mode}
            x={corner.x - handleSize / 2}
            y={corner.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            rx={handleSize / 8}
            className={`media-crop-handle media-crop-${corner.mode}`}
            data-crop-mode={corner.mode}
            fill="white"
            stroke="#176b99"
            strokeWidth={handleSize / 8}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={`Resize crop from ${corner.label} with arrow keys`}
            onKeyDown={(event) => keyboard(event, corner.mode)}
          />
        ))}
      </svg>
    </div>
  );
}
