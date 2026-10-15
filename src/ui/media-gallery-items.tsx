"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  cmsImageSource,
  templateImage,
} from "@/features/cms/kits/template_images";
import type { GalleryItem } from "@/features/cms/gallery_items";
import { Icon } from "./icon";

export type GalleryDraft = GalleryItem & {
  key: string;
  title?: string;
  visibility?: "public" | "private";
};

export function MediaGalleryItems({
  items,
  onChange,
  busy,
}: {
  items: GalleryDraft[];
  onChange: (items: GalleryDraft[]) => void;
  busy: boolean;
}) {
  const dragging = useRef<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  function move(from: number, to: number) {
    if (busy || from === to || from < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setAnnouncement(
      `Image moved from position ${from + 1} to position ${to + 1}.`,
    );
  }
  function update(index: number, changes: Partial<GalleryItem>) {
    onChange(
      items.map((item, position) =>
        position === index ? { ...item, ...changes } : item,
      ),
    );
  }
  return (
    <section
      className="media-gallery-editor"
      aria-label="Arrange gallery images"
    >
      <p className="field-help">
        Drag the handles to arrange images, or use Move up and Move down.
        Captions and alternative text apply to this gallery.
      </p>
      <p className="field-help" role="status" aria-live="polite">
        {announcement}
      </p>
      {items.length ? (
        <ol className="media-gallery-items">
          {items.map((item, index) => {
            const source = cmsImageSource(item.assetId);
            const bundled = templateImage(item.assetId);
            return (
              <li
                key={item.key}
                onDragOver={(event) => {
                  if (dragging.current && !busy) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging.current)
                    move(
                      items.findIndex(
                        (entry) => entry.key === dragging.current,
                      ),
                      index,
                    );
                  dragging.current = undefined;
                }}
              >
                <div className="media-gallery-item-heading">
                  <button
                    type="button"
                    className="media-close media-gallery-drag"
                    aria-label={`Drag image ${index + 1}`}
                    draggable={!busy}
                    disabled={busy}
                    onDragStart={(event) => {
                      dragging.current = item.key;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.key);
                    }}
                    onDragEnd={() => {
                      dragging.current = undefined;
                    }}
                  >
                    <Icon name="more" />
                  </button>
                  <strong>Image {index + 1}</strong>
                  <div className="media-gallery-move-controls">
                    <button
                      type="button"
                      className="media-close"
                      aria-label={`Move image ${index + 1} up`}
                      disabled={busy || index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="media-close"
                      aria-label={`Move image ${index + 1} down`}
                      disabled={busy || index === items.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <Icon name="down" />
                    </button>
                    <button
                      type="button"
                      className="media-close media-delete"
                      aria-label={`Remove image ${index + 1}`}
                      disabled={busy}
                      onClick={() => {
                        onChange(
                          items.filter((entry) => entry.key !== item.key),
                        );
                        setAnnouncement(
                          `Image ${index + 1} removed from this gallery.`,
                        );
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                </div>
                <div className="media-gallery-item-content">
                  <div className="media-gallery-image-preview">
                    {source ? (
                      <Image
                        src={bundled ? source : `${source}?variant=thumbnail`}
                        alt={item.alt}
                        width={240}
                        height={180}
                        unoptimized
                      />
                    ) : (
                      <Icon name="image" />
                    )}
                    <span>
                      {item.title || bundled?.title || "Gallery image"}
                    </span>
                    {item.visibility && (
                      <span
                        className={`media-badge media-badge-${item.visibility}`}
                      >
                        {item.visibility}
                      </span>
                    )}
                  </div>
                  <div className="media-gallery-item-fields">
                    <label>
                      Alternative text
                      <input
                        aria-label={`Alternative text for image ${index + 1}`}
                        value={item.alt}
                        maxLength={250}
                        disabled={busy}
                        onChange={(event) =>
                          update(index, { alt: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Caption
                      <textarea
                        aria-label={`Caption for image ${index + 1}`}
                        rows={2}
                        value={item.caption ?? ""}
                        maxLength={250}
                        disabled={busy}
                        onChange={(event) =>
                          update(index, { caption: event.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="media-empty">
          <Icon name="image" />
          <h3>Your gallery is empty</h3>
          <p>Choose images from the Media library or upload new images.</p>
        </div>
      )}
    </section>
  );
}
