"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cmsImageSource } from "../kits/template_images";
import { Icon } from "@/ui/icon";
import { CarouselControls, useCarousel } from "./carousel";

export type GalleryPresentationProps = {
  items: {
    assetId: string;
    alt: string;
    caption?: string;
    focalX?: number;
    focalY?: number;
  }[];
  columns?: "two" | "three" | "four";
  aspectRatio?: "original" | "square" | "landscape" | "portrait" | "wide";
  layout?: "grid" | "masonry" | "slider";
  fit?: "cover" | "contain";
  lightbox?: boolean;
};

/** The same saved gallery is rendered in page previews and on the public site. */
export function GalleryPresentation(props: GalleryPresentationProps) {
  const [opened, setOpened] = useState<number>();
  const carousel = useCarousel(props.items.length);
  const slider = props.layout === "slider";
  return (
    <section
      className={`cms-block cms-gallery${props.columns ? ` cms-gallery-columns-${props.columns}` : ""}${props.aspectRatio ? ` cms-image-ratio-${props.aspectRatio}` : ""}`}
      data-gallery-layout={props.layout}
      data-gallery-fit={props.fit}
      aria-roledescription={slider ? "carousel" : undefined}
      aria-label={slider ? "Photo album slider" : undefined}
      onKeyDown={(event) => {
        if (
          !slider ||
          props.items.length < 2 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          carousel.move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      {props.items.map((item, index) => {
        if (slider && index !== carousel.index) return null;
        const source = cmsImageSource(item.assetId);
        const image = source ? (
          <Image
            src={source}
            alt={item.alt}
            width={1200}
            height={800}
            unoptimized
            className="cms-image"
            style={{
              objectPosition: `${item.focalX ?? 50}% ${item.focalY ?? 50}%`,
            }}
          />
        ) : (
          <div className="cms-image-placeholder">
            Choose an image from your media library.
          </div>
        );
        return (
          <figure
            key={`${item.assetId}-${index}`}
            id={slider ? carousel.id : undefined}
            aria-roledescription={slider ? "slide" : undefined}
            aria-label={
              slider ? `${index + 1} of ${props.items.length}` : undefined
            }
          >
            {props.lightbox && source ? (
              <button
                type="button"
                className="cms-gallery-open"
                onClick={() => setOpened(index)}
                aria-label={`Enlarge image ${index + 1}${item.alt ? `: ${item.alt}` : ""}`}
              >
                {image}
                <span className="cms-gallery-enlarge" aria-hidden="true">
                  <Icon name="external" />
                </span>
              </button>
            ) : (
              image
            )}
            {item.caption && <figcaption>{item.caption}</figcaption>}
          </figure>
        );
      })}
      {slider && (
        <CarouselControls
          count={props.items.length}
          label="photograph"
          carousel={carousel}
        />
      )}
      {opened !== undefined &&
        createPortal(
          <GalleryLightbox
            items={props.items}
            index={opened}
            onChange={setOpened}
            onClose={() => setOpened(undefined)}
          />,
          document.body,
        )}
    </section>
  );
}

function GalleryLightbox({
  items,
  index,
  onChange,
  onClose,
}: {
  items: GalleryPresentationProps["items"];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const swipe = useRef<number | undefined>(undefined);
  const title = useId();
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    close.current?.focus();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  const item = items[index];
  const source = item ? cmsImageSource(item.assetId) : null;
  function move(direction: -1 | 1) {
    const next = index + direction;
    if (next >= 0 && next < items.length) onChange(next);
  }
  return (
    <dialog
      ref={ref}
      className="cms-gallery-lightbox"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <header>
        <h2 id={title}>
          Image {index + 1} of {items.length}
        </h2>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
        >
          <Icon name="close" />
        </button>
      </header>
      <figure
        onPointerDown={(event) => {
          if (event.pointerType === "touch") swipe.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (
            swipe.current !== undefined &&
            Math.abs(event.clientX - swipe.current) > 50
          )
            move(event.clientX < swipe.current ? 1 : -1);
          swipe.current = undefined;
        }}
        onPointerCancel={() => {
          swipe.current = undefined;
        }}
      >
        {source && (
          <Image
            src={source}
            alt={item.alt}
            width={1600}
            height={1200}
            unoptimized
          />
        )}
        {item?.caption && <figcaption>{item.caption}</figcaption>}
      </figure>
      <footer>
        <button type="button" disabled={index === 0} onClick={() => move(-1)}>
          <Icon name="back" /> Previous image
        </button>
        <span role="status" aria-live="polite">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          disabled={index === items.length - 1}
          onClick={() => move(1)}
        >
          Next image <Icon className="cms-gallery-next" name="back" />
        </button>
      </footer>
    </dialog>
  );
}
