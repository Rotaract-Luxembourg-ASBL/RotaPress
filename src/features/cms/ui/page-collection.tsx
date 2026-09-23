"use client";

import type { PageCard } from "../page_collection";
import { CmsImage, SafeLink, type BlockProps } from "./block-renderers";
import { CarouselControls, useCarousel } from "./carousel";

export function PageIntroBlock(props: BlockProps<"PageIntro">) {
  return (
    <header className={`cms-block cms-page-intro cms-intro-${props.alignment}`}>
      {props.eyebrow && <p className="cms-eyebrow">{props.eyebrow}</p>}
      <h1>{props.title}</h1>
      {props.introduction && <p>{props.introduction}</p>}
    </header>
  );
}

export function PageCollectionBlock({
  items,
  ...props
}: BlockProps<"PageCollection"> & { items: PageCard[] }) {
  const carousel = useCarousel(items.length);
  if (!items.length && !props.emptyText) return null;
  const visible =
    props.layout === "carousel"
      ? items.slice(carousel.index, carousel.index + 1)
      : items;
  return (
    <section
      className={`cms-block cms-page-collection cms-collection-${props.layout}`}
      aria-label={props.title || "Selected pages"}
    >
      {(props.title || props.introduction) && (
        <header className="cms-section-heading">
          {props.title && <h2>{props.title}</h2>}
          {props.introduction && <p>{props.introduction}</p>}
        </header>
      )}
      {items.length ? (
        <div className="cms-card-grid" id={carousel.id}>
          {visible.map((item) => (
            <article className="cms-card" key={item.id}>
              {item.assetId && <CmsImage id={item.assetId} alt="" />}
              <div className="cms-card-copy">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <SafeLink href={item.href} className="text-link">
                  Read the story <span aria-hidden="true">→</span>
                </SafeLink>
              </div>
            </article>
          ))}
        </div>
      ) : (
        props.emptyText && (
          <p className="cms-collection-empty">{props.emptyText}</p>
        )
      )}
      {props.layout === "carousel" && (
        <CarouselControls
          count={items.length}
          label="story"
          carousel={carousel}
        />
      )}
    </section>
  );
}
