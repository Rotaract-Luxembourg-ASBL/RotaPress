"use client";

import Image from "next/image";
import type { CustomField } from "@puckeditor/core";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_GALLERY_IMAGES, type GalleryItem } from "../gallery_items";
import { cmsImageSource, templateImage } from "../kits/template_images";
import { MediaGalleryDialog } from "@/ui/media-gallery-dialog";
import { Icon } from "@/ui/icon";

function GalleryField({
  value,
  onChange,
  readOnly,
}: {
  value: GalleryItem[];
  onChange: (value: GalleryItem[]) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className="cms-gallery-field">
      {value.length > 0 && (
        <div
          className="cms-gallery-field-previews"
          aria-label="Gallery image order"
        >
          {value.slice(0, 6).map((item, index) => {
            const bundled = templateImage(item.assetId);
            const source = cmsImageSource(item.assetId);
            return (
              <span key={`${item.assetId}-${index}`}>
                {source ? (
                  <Image
                    src={bundled ? source : `${source}?variant=thumbnail`}
                    width={96}
                    height={72}
                    alt={item.alt || `Gallery image ${index + 1}`}
                    unoptimized
                  />
                ) : (
                  <Icon name="image" />
                )}
                <span>{index + 1}</span>
              </span>
            );
          })}
        </div>
      )}
      <p className="field-help">
        {value.length} of {MAX_GALLERY_IMAGES} images. Choose multiple images,
        arrange their order and add captions.
      </p>
      <button
        ref={trigger}
        type="button"
        className="button button-outline button-small"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={readOnly}
        onClick={() => setOpen(true)}
      >
        <Icon name="image" />
        {value.length ? "Edit gallery" : "Create gallery"}
      </button>
      {open &&
        createPortal(
          <MediaGalleryDialog
            items={value}
            onDismiss={close}
            onInsert={(items) => {
              onChange(items);
              close();
            }}
          />,
          document.body,
        )}
    </div>
  );
}

export const galleryItemsField: CustomField<GalleryItem[]> = {
  type: "custom",
  label: "Gallery images",
  render: ({ value, onChange, readOnly }) => (
    <GalleryField value={value ?? []} onChange={onChange} readOnly={readOnly} />
  ),
};
