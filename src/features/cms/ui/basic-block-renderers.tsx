import type { CSSProperties, ReactNode } from "react";
import { CmsImage, SafeLink, type BlockProps } from "./block-renderers";

export function HeadingBlock(
  props: Omit<BlockProps<"Heading">, "text"> & { text: ReactNode },
) {
  const Heading = props.level;
  return (
    <div className="cms-block cms-heading">
      <Heading>{props.text}</Heading>
    </div>
  );
}

export function ButtonBlock(props: BlockProps<"Button">) {
  return (
    <div
      className={`cms-block cms-button-row cms-button-align-${props.alignment}`}
    >
      <SafeLink href={props.href} className={`button button-${props.style}`}>
        {props.label}
      </SafeLink>
    </div>
  );
}

export function DividerBlock(props: BlockProps<"Divider">) {
  return <hr className={`cms-block cms-divider cms-divider-${props.width}`} />;
}

export function SpacerBlock(props: BlockProps<"Spacer">) {
  return (
    <div aria-hidden="true" className={`cms-spacer cms-spacer-${props.size}`} />
  );
}

export function CoverBlock(
  props: Omit<BlockProps<"Cover">, "title" | "body"> & {
    title: ReactNode;
    body: ReactNode;
  },
) {
  const banner = props.presentation === "banner";
  const Heading = banner ? "h1" : "h2";
  const imageStyle: CSSProperties | undefined =
    props.imageOpacity === undefined
      ? undefined
      : ({
          "--cms-cover-photo-opacity": props.imageOpacity / 100,
        } as CSSProperties);
  return (
    <section
      className={`cms-block cms-cover cms-cover-tone-${props.tone} cms-cover-padding-${props.padding} cms-cover-align-${props.alignment}`}
      data-presentation={props.presentation}
      style={imageStyle}
    >
      {props.assetId && (
        <CmsImage id={props.assetId} alt="" className="cms-cover-background" />
      )}
      <div className="cms-cover-copy">
        {(!banner || props.title) && <Heading>{props.title}</Heading>}
        {(!banner || props.body) && <p>{props.body}</p>}
        {props.buttonLabel && (
          <SafeLink href={props.buttonHref} className="button button-accent">
            {props.buttonLabel}
          </SafeLink>
        )}
      </div>
    </section>
  );
}
