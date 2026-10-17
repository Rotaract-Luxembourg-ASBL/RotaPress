"use client";

import Image from "next/image";
import type { MediaAssetDto } from "@/features/media/media_schemas";
import { Icon } from "./icon";

export function mediaAssetSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

export function MediaAssetThumbnail({ asset }: { asset: MediaAssetDto }) {
  if (asset.kind === "image")
    return (
      <Image
        src={`/media/${asset.id}?variant=thumbnail`}
        alt=""
        width={240}
        height={180}
        unoptimized
      />
    );
  return (
    <span
      className={`media-file-thumbnail media-file-${asset.kind}`}
      aria-hidden="true"
    >
      <Icon
        name={asset.kind === "document" ? "forms" : "image"}
        width={34}
        height={34}
      />
      <strong>
        {asset.kind === "document"
          ? "PDF"
          : asset.kind === "audio"
            ? "Audio"
            : "Video"}
      </strong>
      <span>{mediaAssetSize(asset.size)}</span>
    </span>
  );
}

/** One bounded preview surface shared by attachment management and image picking. */
export function MediaAssetPreview({ asset }: { asset: MediaAssetDto }) {
  const source = `/media/${asset.id}`;
  if (asset.kind === "audio")
    return (
      <div className="media-file-preview">
        <MediaAssetThumbnail asset={asset} />
        <h3>{asset.title || asset.originalName}</h3>
        <audio
          controls
          preload="metadata"
          aria-label={asset.title || asset.originalName}
        >
          <source src={source} type={asset.mimeType} />
          Your browser cannot play this audio.
        </audio>
        <a href={`${source}?download=1`} className="inline-button">
          Download audio
        </a>
      </div>
    );
  if (asset.kind === "video")
    return (
      <video
        className="media-video-preview"
        controls
        playsInline
        preload="metadata"
        aria-label={asset.title || asset.originalName}
      >
        <source src={source} type={asset.mimeType} />
        <a href={`${source}?download=1`}>Download video</a>
      </video>
    );
  if (asset.kind === "document")
    return (
      <div className="media-file-preview">
        <MediaAssetThumbnail asset={asset} />
        <h3>{asset.title || asset.originalName}</h3>
        <p>PDF document · {mediaAssetSize(asset.size)}</p>
        <a href={`${source}?download=1`} className="button button-outline">
          Download PDF
        </a>
      </div>
    );
  return (
    <Image
      className="media-detail-image"
      src={`/media/${asset.id}`}
      alt={asset.alt}
      width={asset.width}
      height={asset.height}
      unoptimized
    />
  );
}
