"use client";

import { MediaPicker } from "@/ui/media-library";
import type { BlockProps } from "./block-renderers";

type Slides = BlockProps<"ImageSlider">["items"];

export function SliderField({
  value = [],
  onChange,
}: {
  value: Slides;
  onChange: (items: Slides) => void;
}) {
  function update(index: number, changes: Partial<Slides[number]>) {
    onChange(
      value.map((slide, position) =>
        position === index ? { ...slide, ...changes } : slide,
      ),
    );
  }
  function move(index: number, offset: number) {
    const next = [...value];
    const [slide] = next.splice(index, 1);
    next.splice(index + offset, 0, slide);
    onChange(next);
  }
  return (
    <div className="cms-slide-field">
      <h3>Slides</h3>
      <p className="field-help">
        Add up to 12 images. Visitors move through them with the slider
        controls.
      </p>
      {value.map((slide, index) => (
        <fieldset key={index}>
          <legend>Slide {index + 1}</legend>
          <MediaPicker
            label={`Choose image for slide ${index + 1}`}
            value={slide.assetId}
            onChange={(assetId) => update(index, { assetId })}
          />
          <label>
            Alternative text for slide {index + 1}
            <input
              value={slide.alt}
              maxLength={250}
              onChange={(event) => update(index, { alt: event.target.value })}
            />
          </label>
          <label>
            Caption for slide {index + 1}
            <input
              value={slide.caption}
              maxLength={250}
              onChange={(event) =>
                update(index, { caption: event.target.value })
              }
            />
          </label>
          <div className="cms-slide-actions">
            {(["focalX", "focalY"] as const).map((axis) => (
              <label key={axis}>
                {axis === "focalX"
                  ? "Focal point across (%)"
                  : "Focal point down (%)"}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={slide[axis] ?? 50}
                  onChange={(event) =>
                    update(index, { [axis]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
            <button
              type="button"
              aria-label={`Move slide ${index + 1} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move slide ${index + 1} down`}
              disabled={index === value.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(value.filter((_, position) => position !== index))
              }
            >
              Remove slide {index + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="button button-outline button-small"
        disabled={value.length >= 12}
        onClick={() =>
          onChange([...value, { assetId: "", alt: "", caption: "" }])
        }
      >
        Add slide
      </button>
    </div>
  );
}
