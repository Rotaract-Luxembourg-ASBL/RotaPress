"use client";

import { useId, useState } from "react";

/** Manual-only shared navigation. Focus stays on the initiating control. */
export function useCarousel(count: number) {
  const [selected, select] = useState(0);
  const id = useId();
  const index = Math.max(0, Math.min(selected, count - 1));
  const move = (direction: number) =>
    select((index + direction + count) % count);
  return { id, index, select, move };
}

export function CarouselControls({
  count,
  label,
  carousel,
}: {
  count: number;
  label: string;
  carousel: ReturnType<typeof useCarousel>;
}) {
  if (count < 2) return null;
  return (
    <div className="cms-slider-controls">
      <button
        type="button"
        className="cms-slider-arrow"
        aria-label={`Previous ${label}`}
        aria-controls={carousel.id}
        onClick={() => carousel.move(-1)}
      >
        ←
      </button>
      <span role="status" aria-live="polite" aria-atomic="true">
        {carousel.index + 1} / {count}
      </span>
      <button
        type="button"
        className="cms-slider-arrow"
        aria-label={`Next ${label}`}
        aria-controls={carousel.id}
        onClick={() => carousel.move(1)}
      >
        →
      </button>
    </div>
  );
}
