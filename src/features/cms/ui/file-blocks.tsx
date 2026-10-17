import type { BlockProps } from "./block-renderers";
import { VideoPlayer } from "./video-player";

export function FileBlock(props: BlockProps<"File">) {
  return (
    <section className="cms-block cms-file-block">
      {props.assetId ? (
        <a
          className="button"
          href={`/media/${props.assetId}?download=1`}
          download
        >
          {props.label || "Download PDF"}
        </a>
      ) : (
        <p>Choose a PDF from your media library.</p>
      )}
      {props.description && <p>{props.description}</p>}
    </section>
  );
}

export function AudioBlock(props: BlockProps<"Audio">) {
  return (
    <figure className="cms-block cms-playback-block">
      {props.title && <figcaption>{props.title}</figcaption>}
      {props.assetId ? (
        <audio
          controls
          preload="metadata"
          src={`/media/${props.assetId}`}
          aria-label={props.title || "Audio recording"}
        />
      ) : (
        <p>Choose an audio recording from your media library.</p>
      )}
      {props.transcript && (
        <details>
          <summary>Read transcript</summary>
          <p className="cms-transcript">{props.transcript}</p>
        </details>
      )}
    </figure>
  );
}

export function VideoBlock(props: BlockProps<"Video">) {
  return (
    <figure className="cms-block cms-playback-block">
      {props.title && <figcaption>{props.title}</figcaption>}
      {props.assetId ? (
        <VideoPlayer {...props} />
      ) : (
        <p>Choose a video from your media library.</p>
      )}
      {props.transcript && (
        <details>
          <summary>Read transcript</summary>
          <p className="cms-transcript">{props.transcript}</p>
        </details>
      )}
    </figure>
  );
}
