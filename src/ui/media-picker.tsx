"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import {
  cmsImageSource,
  templateImage,
} from "@/features/cms/kits/template_images";
import { MediaPickerDialog } from "./media-picker-dialog";
import { useResource } from "./api";
import { MediaAssetThumbnail } from "./media-asset-preview";
export { MediaPickerDialog } from "./media-picker-dialog";

export function MediaPicker({
  value,
  onChange,
  onSelect,
  kind = "image",
  label = kind === "image" ? "Choose image" : "Choose file",
}: {
  value: string;
  onChange: (id: string) => void;
  onSelect?: (asset: MediaAssetDto) => void;
  label?: string;
  kind?: MediaAssetDto["kind"];
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<MediaAssetDto>();
  const detail = useResource<{ asset: MediaAssetDto }>(
    kind !== "image" && value
      ? `/api/admin/media/${encodeURIComponent(value)}`
      : null,
  );
  const selected = chosen?.id === value ? chosen : detail.data?.asset;
  const noun = kind === "image" ? "image" : "file";
  const bundled = templateImage(value);
  const source = cmsImageSource(value);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className={`media-picker${value ? " has-image" : ""}`}>
      {source && kind === "image" && (
        <div className="media-picker-preview">
          <button
            type="button"
            className="media-picker-preview-open"
            aria-label="Replace current image"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <Image
              src={source}
              alt={selected?.alt ?? bundled?.alt ?? "Selected image"}
              width={360}
              height={240}
              unoptimized
            />
          </button>
          <span>
            {selected?.title ||
              (bundled ? `${bundled.title} · Template image` : "Current image")}
          </span>
        </div>
      )}
      {kind !== "image" && value && (
        <button
          type="button"
          className="media-picker-file-preview"
          onClick={() => setOpen(true)}
          aria-label="Replace current file"
          aria-haspopup="dialog"
        >
          {selected ? (
            <>
              <MediaAssetThumbnail asset={selected} />
              <span>{selected.title || selected.originalName}</span>
            </>
          ) : (
            <span>
              {detail.error
                ? "File unavailable — choose another"
                : "Loading file…"}
            </span>
          )}
        </button>
      )}
      <div className="media-picker-actions">
        <button
          ref={trigger}
          type="button"
          className="button button-outline button-small"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          {value ? `Replace ${noun}` : label}
        </button>
        {value && (
          <button
            type="button"
            className="inline-button"
            onClick={() => {
              onChange("");
              setChosen(undefined);
            }}
          >
            Remove {noun}
          </button>
        )}
      </div>
      {open &&
        createPortal(
          <MediaPickerDialog
            currentId={value}
            kind={kind}
            onDismiss={close}
            onRemoved={(id) => {
              if (id === value) {
                onChange("");
                setChosen(undefined);
              }
            }}
            onInsert={(asset) => {
              setChosen(asset);
              onChange(asset.id);
              onSelect?.(asset);
              close();
            }}
          />,
          document.body,
        )}
    </div>
  );
}
