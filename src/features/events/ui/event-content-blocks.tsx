import {
  ImageBlock,
  SafeLink,
  type BlockProps,
} from "@/features/cms/ui/block-renderers";
import { EventShareActions } from "./event-share-actions";

export function EventContactBlock(props: BlockProps<"EventContact">) {
  return (
    <section className="cms-block event-contact-block">
      {props.title && <h2>{props.title}</h2>}
      {props.text && <p className="event-contact-introduction">{props.text}</p>}
      <address className="event-contact-links">
        {props.email && (
          <a href={`mailto:${encodeURIComponent(props.email)}`}>
            {props.email}
          </a>
        )}
        {props.phone && (
          <a href={`tel:${props.phone.replace(/[^+0-9]/g, "")}`}>
            {props.phone}
          </a>
        )}
        {props.website && (
          <SafeLink href={props.website} className="text-link">
            Visit event website
          </SafeLink>
        )}
      </address>
    </section>
  );
}

export function EventFlyerBlock(props: BlockProps<"EventFlyer">) {
  if (!props.assetId) return null;
  return (
    <section className="cms-block event-flyer-block">
      {props.title && <h2>{props.title}</h2>}
      <ImageBlock
        id={props.id}
        version={props.version}
        assetId={props.assetId}
        alt={props.alt}
        caption={props.caption}
        width="medium"
        alignment="center"
        aspectRatio="original"
        fit="contain"
        corners="soft"
      />
      <a className="text-link" href={`/media/${props.assetId}`}>
        Open flyer image
      </a>
    </section>
  );
}

/** Only a published, server-derived event URL may reach the sharing controls. */
export function EventShareBlock({
  title,
  url,
  preview = false,
}: {
  title: string;
  url?: string;
  preview?: boolean;
}) {
  if (!preview && !url) return null;
  return (
    <section className="cms-block event-share-block">
      {title && <h2>{title}</h2>}
      {preview ? (
        <>
          <div className="event-share-buttons">
            <button type="button" className="button button-outline" disabled>
              Copy link
            </button>
            <button type="button" className="button button-outline" disabled>
              Share event
            </button>
          </div>
          <p className="field-help">
            Sharing is available on the published event page. Preview links stay
            private.
          </p>
        </>
      ) : (
        <EventShareActions url={url!} />
      )}
    </section>
  );
}
