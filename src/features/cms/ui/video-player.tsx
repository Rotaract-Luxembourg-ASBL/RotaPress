"use client";

import { useEffect, useRef } from "react";
import type { BlockProps } from "./block-renderers";
import { videoCaptionsVtt } from "../video_captions";

export function VideoPlayer(props: BlockProps<"Video">) {
  const trackRef = useRef<HTMLTrackElement>(null);
  const captions = videoCaptionsVtt(props.captions);
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !captions) return;
    const url = URL.createObjectURL(new Blob([captions], { type: "text/vtt" }));
    track.src = url;
    return () => {
      track.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [captions]);

  return (
    <video
      controls
      playsInline
      preload="metadata"
      src={`/media/${props.assetId}`}
      poster={props.posterAssetId ? `/media/${props.posterAssetId}` : undefined}
      aria-label={props.title || "Video"}
    >
      {captions && (
        <track
          ref={trackRef}
          kind="captions"
          srcLang={props.captionLanguage || "en"}
          label={props.captionLabel || "Captions"}
          default
        />
      )}
    </video>
  );
}
