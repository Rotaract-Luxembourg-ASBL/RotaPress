import Image from "next/image";
import type { ReactNode } from "react";
import { isSafeLink, type Block } from "../cms_schemas";
import { FeatureIcon } from "./feature-icon";
import { cmsImageSource } from "../kits/template_images";
import { PublicAccountLink } from "@/ui/public-account-link";

export type BlockProps<T extends Block["type"]> = Extract<
  Block,
  { type: T }
>["props"];

export function SafeLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  if (href === "/sign-in" || href.startsWith("/sign-in?"))
    return (
      <PublicAccountLink href={href} className={className}>
        {children}
      </PublicAccountLink>
    );
  return href && isSafeLink(href) ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

export function CmsImage({
  id,
  alt,
  className = "",
  focalX = 50,
  focalY = 50,
  flipHorizontal = false,
  flipVertical = false,
}: {
  id: string;
  alt: string;
  className?: string;
  focalX?: number;
  focalY?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}) {
  const src = cmsImageSource(id);
  return src ? (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={800}
      unoptimized
      className={`cms-image ${className}`}
      style={{
        objectPosition: `${focalX}% ${focalY}%`,
        transform:
          flipHorizontal || flipVertical
            ? `scale(${flipHorizontal ? -1 : 1}, ${flipVertical ? -1 : 1})`
            : undefined,
      }}
    />
  ) : (
    <div className="cms-image-placeholder">
      Choose an image from your media library.
    </div>
  );
}

export function HeroBlock(
  props: Omit<BlockProps<"Hero">, "title" | "body"> & {
    title: ReactNode;
    body: ReactNode;
  },
) {
  return (
    <section
      className={`cms-block cms-hero${props.assetId ? ` cms-hero-with-image cms-hero-image-${props.imagePosition ?? "right"}` : ""}`}
    >
      <div className="cms-hero-copy">
        <h1>{props.title}</h1>
        <p>{props.body}</p>
        {props.buttonLabel && (
          <SafeLink className="button button-accent" href={props.buttonHref}>
            {props.buttonLabel}
          </SafeLink>
        )}
      </div>
      {props.assetId && (
        <CmsImage
          id={props.assetId}
          alt={props.imageAlt ?? ""}
          className="cms-hero-image"
        />
      )}
    </section>
  );
}

export function ImageBlock(
  props: BlockProps<"Image"> & { controls?: ReactNode },
) {
  const image = (
    <CmsImage
      id={props.assetId}
      alt={props.alt}
      focalX={props.focalX}
      focalY={props.focalY}
      flipHorizontal={props.flipHorizontal}
      flipVertical={props.flipVertical}
    />
  );
  return (
    <figure
      className={`cms-block cms-image-block cms-image-width-${props.width ?? "full"} cms-image-align-${props.alignment ?? "center"} cms-image-ratio-${props.aspectRatio ?? "original"} cms-image-fit-${props.fit ?? "cover"} cms-image-corners-${props.corners ?? "soft"}`}
      style={
        props.widthPx ? { width: props.widthPx, maxWidth: "100%" } : undefined
      }
    >
      <div className="cms-image-frame">
        {props.href ? (
          <SafeLink href={props.href} className="cms-image-link">
            {image}
          </SafeLink>
        ) : (
          image
        )}
        {props.controls}
      </div>
      {props.caption && <figcaption>{props.caption}</figcaption>}
    </figure>
  );
}

export function GalleryBlock(props: BlockProps<"Gallery">) {
  return (
    <section
      className={`cms-block cms-gallery${props.columns ? ` cms-gallery-columns-${props.columns}` : ""}${props.aspectRatio ? ` cms-image-ratio-${props.aspectRatio}` : ""}`}
    >
      {props.items.map((item, index) => (
        <figure key={`${item.assetId}-${index}`}>
          <CmsImage id={item.assetId} alt={item.alt} />
          {item.caption && <figcaption>{item.caption}</figcaption>}
        </figure>
      ))}
    </section>
  );
}

export function CardsBlock(props: BlockProps<"Cards">) {
  return (
    <section className="cms-block cms-card-grid">
      {props.items.map((item, index) => (
        <article key={index} className="cms-card">
          {item.assetId && <CmsImage id={item.assetId} alt={item.alt ?? ""} />}
          <FeatureIcon name={item.icon} />
          <h2>{item.title}</h2>
          <p>{item.text}</p>
          {item.href && (
            <SafeLink className="text-link" href={item.href}>
              {item.linkLabel || "Learn more →"}
            </SafeLink>
          )}
        </article>
      ))}
    </section>
  );
}

export function StatisticsBlock(props: BlockProps<"Statistics">) {
  return (
    <section className="cms-block cms-statistics">
      {props.items.map((item, index) => (
        <div key={index}>
          <strong>{item.value}</strong>
          <p>{item.label}</p>
        </div>
      ))}
    </section>
  );
}

export function CallToActionBlock(props: BlockProps<"CallToAction">) {
  return (
    <section className="cms-block cms-callout">
      <div>
        <h2>{props.title}</h2>
        <p>{props.text}</p>
      </div>
      {props.label && (
        <SafeLink className="button button-accent" href={props.href}>
          {props.label}
        </SafeLink>
      )}
    </section>
  );
}

export function FaqBlock(props: BlockProps<"FAQ">) {
  return (
    <section className="cms-block cms-faq">
      {props.items.map((item, index) => (
        <details key={index}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </section>
  );
}

export function TeamBlock(props: BlockProps<"Team">) {
  return (
    <section className="cms-block cms-card-grid">
      {props.items.map((item, index) => (
        <article className="cms-person" key={index}>
          {item.assetId && <CmsImage id={item.assetId} alt={item.name} />}
          <h2>{item.name}</h2>
          <p>{item.role}</p>
        </article>
      ))}
    </section>
  );
}

export function SponsorsBlock(props: BlockProps<"Sponsors">) {
  return (
    <section className="cms-block cms-card-grid">
      {props.items.map((item, index) => (
        <SafeLink href={item.href} className="cms-sponsor" key={index}>
          {item.assetId && <CmsImage id={item.assetId} alt="" />}
          <h2>{item.name}</h2>
        </SafeLink>
      ))}
    </section>
  );
}
