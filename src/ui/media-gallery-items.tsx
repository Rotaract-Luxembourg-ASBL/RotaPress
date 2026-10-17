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
  const [activeKey, setActiveKey] = useState(items[0]?.key);
  const [announcement, setAnnouncement] = useState("");
  const selected = items.find((item) => item.key === activeKey) ?? items[0];
  const selectedIndex = selected ? items.indexOf(selected) : -1;

  function move(from: number, to: number) {
    if (busy || from === to || from < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setActiveKey(item.key);
    setAnnouncement(
      `Image moved from position ${from + 1} to position ${to + 1}.`,
    );
  }
  function update(changes: Partial<GalleryItem>) {
    if (!selected || busy) return;
    onChange(
      items.map((item) =>
        item.key === selected.key ? { ...item, ...changes } : item,
      ),
    );
  }
  function remove(index: number) {
    if (busy) return;
    onChange(items.filter((_, position) => position !== index));
    setActiveKey(items[index + 1]?.key ?? items[index - 1]?.key);
    setAnnouncement(`Image ${index + 1} removed from this gallery.`);
  }
  return (
    <section
      className="media-gallery-editor"
      aria-label="Arrange gallery images"
    >
      <p className="field-help">
        Drag images to arrange them. Select a photograph to edit its caption and
        alternative text for this gallery.
      </p>
      <p
        className="media-gallery-announcement"
        role="status"
        aria-live="polite"
      >
        {announcement}
      </p>
      {items.length ? (
        <div className="media-gallery-composer">
          <ol className="media-gallery-items">
            {items.map((item, index) => {
              const source = cmsImageSource(item.assetId);
              const bundled = templateImage(item.assetId);
              return (
                <li
                  key={item.key}
                  className={
                    item.key === selected?.key ? "is-active" : undefined
                  }
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
                  <button
                    type="button"
                    className="media-gallery-select"
                    disabled={busy}
                    aria-label={`Edit gallery image ${index + 1}`}
                    aria-pressed={item.key === selected?.key}
                    onClick={() => setActiveKey(item.key)}
                    draggable={!busy}
                    onDragStart={(event) => {
                      dragging.current = item.key;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.key);
                    }}
                    onDragEnd={() => {
                      dragging.current = undefined;
                    }}
                  >
                    {source ? (
                      <Image
                        src={bundled ? source : `${source}?variant=thumbnail`}
                        alt=""
                        width={240}
                        height={180}
                        unoptimized
                        style={{
                          objectPosition: `${item.focalX ?? 50}% ${item.focalY ?? 50}%`,
                        }}
                      />
                    ) : (
                      <Icon name="image" />
                    )}
                    <span className="media-gallery-position">{index + 1}</span>
                    <span className="media-gallery-card-title">
                      {item.title || bundled?.title || "Gallery image"}
                    </span>
                  </button>
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
                      onClick={() => remove(index)}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          {selected && (
            <aside
              className="media-gallery-item-fields"
              aria-label={`Gallery image ${selectedIndex + 1} settings`}
            >
              <h3>
                Image {selectedIndex + 1} of {items.length}
              </h3>
              <p className="field-help">
                {selected.title ||
                  templateImage(selected.assetId)?.title ||
                  "Gallery image"}
              </p>
              {selected.visibility && (
                <span
                  className={`media-badge media-badge-${selected.visibility}`}
                >
                  {selected.visibility}
                </span>
              )}
              <label>
                Alternative text
                <input
                  aria-label={`Alternative text for image ${selectedIndex + 1}`}
                  value={selected.alt}
                  maxLength={250}
                  disabled={busy}
                  onChange={(event) => update({ alt: event.target.value })}
                />
              </label>
              <p className="field-help">
                Describe what the photograph communicates. Leave empty for a
                decorative image.
              </p>
              <label>
                Caption
                <textarea
                  aria-label={`Caption for image ${selectedIndex + 1}`}
                  rows={3}
                  value={selected.caption ?? ""}
                  maxLength={250}
                  disabled={busy}
                  onChange={(event) => update({ caption: event.target.value })}
                />
              </label>
              <p className="field-help">
                These edits apply to this gallery. Library details are managed
                in Media.
              </p>
              <fieldset className="media-gallery-focal">
                <legend>Crop focus</legend>
                <p className="field-help">
                  Keep this point visible when the photograph fills a frame.
                </p>
                {(["focalX", "focalY"] as const).map((axis) => (
                  <label key={axis}>
                    {axis === "focalX" ? "Horizontal" : "Vertical"} focus:{" "}
                    {selected[axis] ?? 50}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={selected[axis] ?? 50}
                      disabled={busy}
                      onChange={(event) =>
                        update({ [axis]: Number(event.target.value) })
                      }
                    />
                  </label>
                ))}
                <button
                  type="button"
                  className="inline-button"
                  disabled={busy}
                  onClick={() => update({ focalX: 50, focalY: 50 })}
                >
                  Center focus
                </button>
              </fieldset>
              <button
                type="button"
                className="inline-button media-delete"
                disabled={busy}
                onClick={() => remove(selectedIndex)}
              >
                Remove from gallery
              </button>
            </aside>
          )}
        </div>
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
