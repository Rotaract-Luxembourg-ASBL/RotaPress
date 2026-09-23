"use client";

import { useCarousel } from "./carousel";
import { CmsImage, SafeLink, type BlockProps } from "./block-renderers";

export function HeroSliderBlock(props: BlockProps<"HeroSlider">) {
  const {
    index: selected,
    select: setSelected,
    id,
  } = useCarousel(props.items.length);
  const index = Math.min(selected, Math.max(0, props.items.length - 1));
  const slide = props.items[index];
  if (!slide) return null;
  return (
    <section
      className={`cms-block cms-hero-slider cms-hero-panel-${props.position}`}
      aria-label={props.label || "Featured stories"}
      aria-roledescription="carousel"
    >
      <div
        id={id}
        className="cms-hero-slide"
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${props.items.length}`}
      >
        {slide.assetId && (
          <CmsImage
            id={slide.assetId}
            alt={slide.alt}
            className="cms-hero-slide-image"
            focalX={slide.focalX}
            focalY={slide.focalY}
          />
        )}
        <div className="cms-hero-panel">
          <h1>{slide.title}</h1>
          <p>{slide.body}</p>
          {slide.buttonLabel && (
            <SafeLink className="button button-accent" href={slide.buttonHref}>
              {slide.buttonLabel}
            </SafeLink>
          )}
        </div>
      </div>
      {props.items.length > 1 && (
        <div className="cms-hero-controls">
          <button
            type="button"
            aria-controls={id}
            aria-label="Previous featured story"
            onClick={() =>
              setSelected((index + props.items.length - 1) % props.items.length)
            }
          >
            ←
          </button>
          <span role="status" aria-live="polite">
            {index + 1} / {props.items.length}
          </span>
          <button
            type="button"
            aria-controls={id}
            aria-label="Next featured story"
            onClick={() => setSelected((index + 1) % props.items.length)}
          >
            →
          </button>
        </div>
      )}
    </section>
  );
}
