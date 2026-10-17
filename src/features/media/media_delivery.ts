import "server-only";
import type { TrustedActor } from "@/core/authorization/AuthorizationService";
import type { MediaService } from "./MediaService";
import { imageThumbnail } from "./image_preview";
import { DomainError } from "@/core/DomainError";

/** Single byte ranges only. Multipart and malformed ranges are rejected without reading bytes. */
export function mediaRange(value: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (!match || (!match[1] && !match[2])) return "invalid";
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return "invalid";
  if (first === null) {
    if (last === null || last <= 0) return "invalid";
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== null && last < first)) return "invalid";
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}
export async function deliverMedia(media: MediaService, actor: TrustedActor | null, id: string, request: Request) {
  const asset = await media.deliveryAsset(actor, id);
  const url = new URL(request.url);
  const thumbnail = url.searchParams.get("variant") === "thumbnail";
  const download = url.searchParams.get("download") === "1" || asset.kind === "document";
  const filename = asset.originalName.replace(/[\r\n"\\]/gu, "_").replace(/[^\x20-\x7e]/gu, "_");
  const headers = new Headers({
    "Content-Type": asset.mimeType, "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(asset.originalName).replace(/['()*]/gu, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
    "Accept-Ranges": "bytes",
  });
  if (thumbnail) {
    if (asset.kind !== "image") throw new DomainError("MEDIA_IMAGE_REQUIRED", "This file does not have an image thumbnail.", 422);
    const stored = await media.read(actor, id);
    const bytes = await imageThumbnail(stored.bytes);
    await media.deliveryAsset(actor, id);
    headers.set("Content-Length", String(bytes.length));
    headers.set("Content-Type", "image/webp");
    return new Response(request.method === "HEAD" ? null : new Uint8Array(bytes), { headers });
  }
  // No validators are served: If-Range requires a full representation.
  const range = mediaRange(request.headers.has("if-range") ? null : request.headers.get("range"), asset.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${asset.size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Length", String(range ? range.end - range.start + 1 : asset.size));
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${asset.size}`);
  const stream = request.method === "HEAD" ? null : await media.stream(actor, id, range ?? undefined);
  return new Response(stream, { status: range ? 206 : 200, headers });
}
