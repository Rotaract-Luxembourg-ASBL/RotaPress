"use client";

import { useCarousel } from "./carousel";
import { CmsImage, type BlockProps } from "./block-renderers";

export function ImageSliderBlock(props: BlockProps<"ImageSlider">) {
  const {
    index,
    select: setIndex,
    id: slideId,
  } = useCarousel(props.items.length);
  const count = props.items.length;
  const active = Math.max(0, Math.min(index, count - 1));
  const current = props.items[active];
  if (!current) return null;
  function move(direction: number) {
    setIndex((active + direction + count) % count);
  }
  return (
    <section
      className={`cms-block cms-image-slider cms-image-ratio-${props.aspectRatio ?? "landscape"}`}
      aria-roledescription="carousel"
      aria-label="Image slider"
    >
      <figure
        id={slideId}
        aria-roledescription="slide"
        aria-label={`${active + 1} of ${count}`}
      >
        <CmsImage
          id={current.assetId}
          alt={current.alt}
          focalX={current.focalX}
          focalY={current.focalY}
        />
        {current.caption && <figcaption>{current.caption}</figcaption>}
      </figure>
      {count > 1 && (
        <div className="cms-slider-controls">
          <button
            type="button"
            className="cms-slider-arrow"
            aria-label="Previous image"
            aria-controls={slideId}
            onClick={() => move(-1)}
          >
            ←
          </button>
          <div
            className="cms-slider-indicators"
            role="group"
            aria-label="Choose slide"
          >
            {props.items.map((item, position) => (
              <button
                key={`${item.assetId}-${position}`}
                type="button"
                aria-label={`Show image ${position + 1}`}
                aria-controls={slideId}
                aria-current={position === active ? "true" : undefined}
                className={position === active ? "is-active" : ""}
                onClick={() => setIndex(position)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cms-slider-arrow"
            aria-label="Next image"
            aria-controls={slideId}
            onClick={() => move(1)}
          >
            →
          </button>
          <span
            className="cms-slider-status"
            aria-live="polite"
            aria-atomic="true"
          >
            Image {active + 1} of {count}
          </span>
        </div>
      )}
    </section>
  );
}
