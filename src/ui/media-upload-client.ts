"use client";
import type {
  AdminMediaAssetDto,
  MediaKind,
} from "@/features/media/media_schemas";
import { mediaLimits } from "@/features/media/media_schemas";
import type { UploadSessionDto } from "@/features/media/upload_schemas";
import { request } from "./api";
import { contentGenerationHeader } from "@/core/content/content_boundary";

export const uploadFormats: Record<MediaKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  document: ["application/pdf"],
  audio: ["audio/mpeg", "audio/mp4", "audio/x-m4a"],
  video: ["video/mp4", "video/webm"],
};
export const uploadExtensions: Record<MediaKind, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".webp"],
  document: [".pdf"],
  audio: [".mp3", ".m4a"],
  video: [".mp4", ".webm"],
};
export type UploadSubmission = {
  title: string;
  alt: string;
  collection: string;
  visibility: "public" | "private";
};
export type UploadAttempt = {
  requestId: string;
  submission: UploadSubmission;
  sessionId?: string;
  generation?: string;
};
export function uploadKind(
  file: File,
  kinds: readonly MediaKind[],
): MediaKind | undefined {
  const mimeType = file.type.toLowerCase();
  if (mimeType && mimeType !== "application/octet-stream")
    return kinds.find((kind) => uploadFormats[kind].includes(mimeType));
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  // Only a chooser hint: the server still validates bytes and actual container/codecs.
  return kinds.find((kind) => uploadExtensions[kind].includes(extension));
}
export function uploadProblem(file: File, kinds: readonly MediaKind[]) {
  const kind = uploadKind(file, kinds);
  if (!kind) return "Choose a supported file type.";
  if (!file.size || file.size > mediaLimits[kind])
    return `Choose a ${kind} file smaller than ${mediaLimits[kind] / 1024 / 1024} MiB.`;
}
const storageKey = (file: File) =>
  `rotapress-upload:${file.name}:${file.size}:${file.lastModified}`;
export function savedUpload(file: File): UploadAttempt | undefined {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(storageKey(file)) ?? "null",
    );
    if (
      !value ||
      typeof value !== "object" ||
      !("requestId" in value) ||
      typeof value.requestId !== "string" ||
      !("submission" in value) ||
      !value.submission ||
      typeof value.submission !== "object"
    )
      return;
    const s = value.submission;
    if (
      !("title" in s) ||
      typeof s.title !== "string" ||
      !("alt" in s) ||
      typeof s.alt !== "string" ||
      !("collection" in s) ||
      typeof s.collection !== "string" ||
      !("visibility" in s) ||
      !["public", "private"].includes(String(s.visibility))
    )
      return;
    const generation =
      "generation" in value && typeof value.generation === "string"
        ? value.generation
        : undefined;
    if (!generation && document.body.dataset.contentResetAt) return;
    return {
      requestId: value.requestId,
      submission: s as UploadSubmission,
      generation,
      sessionId:
        "sessionId" in value && typeof value.sessionId === "string"
          ? value.sessionId
          : undefined,
    };
  } catch {
    return;
  }
}
export function rememberUpload(file: File, attempt?: UploadAttempt) {
  try {
    if (attempt)
      sessionStorage.setItem(storageKey(file), JSON.stringify(attempt));
    else sessionStorage.removeItem(storageKey(file));
  } catch {
    /* Browser storage can be disabled; in-memory retry still works. */
  }
}
export async function uploadFile(
  file: File,
  kind: MediaKind,
  attempt: UploadAttempt,
  signal: AbortSignal,
  progress: (percent: number, sessionId: string) => void,
): Promise<AdminMediaAssetDto> {
  attempt.generation ??= document.body.dataset.contentGeneration;
  const headers: Record<string, string> = attempt.generation
    ? { [contentGenerationHeader]: attempt.generation }
    : {};
  rememberUpload(file, attempt);
  const session = await request<UploadSessionDto>("/api/admin/media/uploads", {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      ...attempt.submission,
      requestId: attempt.requestId,
      filename: file.name,
      kind,
      size: file.size,
    }),
  });
  attempt.sessionId = session.id;
  rememberUpload(file, attempt);
  progress(0, session.id);
  let received = 0;
  // One chunk per file and two file workers bound total network and memory use.
  // Re-hash acknowledged chunks after reselection, so a changed middle cannot mix files.
  for (let index = 0; index < session.totalChunks; index++) {
    signal.throwIfAborted();
    const chunk = file.slice(
      index * session.chunkSize,
      (index + 1) * session.chunkSize,
    );
    if (session.received.includes(index)) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await chunk.arrayBuffer(),
      );
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== session.hashes[index])
        throw new Error(
          "This file changed since the interrupted upload. Remove it from the queue and choose it again.",
        );
    } else {
      await request<UploadSessionDto>(
        `/api/admin/media/uploads/${session.id}?chunk=${index}`,
        {
          method: "PUT",
          signal,
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: chunk,
        },
      );
    }
    received += chunk.size;
    progress(
      Math.min(99, Math.floor((received / file.size) * 100)),
      session.id,
    );
  }
  const asset = await request<AdminMediaAssetDto>(
    `/api/admin/media/uploads/${session.id}`,
    { method: "POST", signal, headers },
  );
  rememberUpload(file);
  progress(100, session.id);
  return asset;
}
