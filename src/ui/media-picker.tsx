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
export { MediaPickerDialog } from "./media-picker-dialog";

export function MediaPicker({
  value,
  onChange,
  onSelect,
  label = "Choose image",
}: {
  value: string;
  onChange: (id: string) => void;
  onSelect?: (asset: MediaAssetDto) => void;
  label?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<MediaAssetDto>();
  const selected = chosen?.id === value ? chosen : undefined;
  const bundled = templateImage(value);
  const source = cmsImageSource(value);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className={`media-picker${value ? " has-image" : ""}`}>
      {source && (
        <div className="media-picker-preview">
          <Image
            src={source}
            alt={selected?.alt ?? bundled?.alt ?? "Selected image"}
            width={360}
            height={240}
            unoptimized
          />
          <span>
            {selected?.title ||
              (bundled ? `${bundled.title} · Template image` : "Current image")}
          </span>
        </div>
      )}
      <div className="media-picker-actions">
        <button
          ref={trigger}
          type="button"
          className="button button-outline button-small"
          onClick={() => setOpen(true)}
        >
          {value ? "Replace image" : label}
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
            Remove image
          </button>
        )}
      </div>
      {open &&
        createPortal(
          <MediaPickerDialog
            currentId={value}
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
