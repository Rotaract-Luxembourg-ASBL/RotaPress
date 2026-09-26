import "server-only";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { DomainError } from "@/core/DomainError";
import { previewDocumentPath } from "./preview_snapshot";

const mimeTypes: Readonly<Record<string, string>> = {
  css: "text/css",
  woff: "font/woff",
  woff2: "font/woff2",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};
export type PreviewAsset = { bytes: Buffer; mimeType: string };

export function previewOrigin(rawPort = process.env.PORT ?? "3000") {
  if (
    !/^\d{1,5}$/.test(rawPort) ||
    Number(rawPort) < 1 ||
    Number(rawPort) > 65535
  )
    throw new DomainError(
      "PREVIEW_UNAVAILABLE",
      "The visual preview runtime is unavailable.",
      503,
    );
  return `http://127.0.0.1:${Number(rawPort)}`;
}

/** Static application files only. Never use a user URL as a file path or fetch target. */
export async function readPreviewStatic(
  pathname: string,
  root = process.cwd(),
): Promise<PreviewAsset | null> {
  if (
    !/^\/[A-Za-z0-9_./-]+$/.test(pathname) ||
    pathname.split("/").includes("..")
  )
    return null;
  const extension = pathname.split(".").at(-1) ?? "";
  const mimeType = mimeTypes[extension];
  if (!mimeType) return null;
  const next =
    pathname.startsWith("/_next/static/") &&
    ["css", "woff", "woff2"].includes(extension);
  const publicAsset =
    /^(?:\/templates\/|\/brand\/)/.test(pathname) &&
    mimeType.startsWith("image/");
  if (!next && !publicAsset) return null;
  const directory = resolve(root, next ? ".next/static" : "public");
  const file = resolve(
    directory,
    next ? pathname.slice("/_next/static/".length) : pathname.slice(1),
  );
  try {
    const [canonicalDirectory, canonicalFile] = await Promise.all([
      realpath(directory),
      realpath(file),
    ]);
    const within = relative(canonicalDirectory, canonicalFile);
    if (!within || isAbsolute(within) || within.startsWith("..")) return null;
    const info = await stat(canonicalFile);
    if (!info.isFile() || info.size > 5 * 1024 * 1024) return null;
    const bytes = await readFile(canonicalFile);
    if (bytes.length > 5 * 1024 * 1024) return null;
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

/** One fixed instance-local request; the capability never enters a browser or URL. */
export async function fetchPreviewDocument(
  origin: string,
  token: string,
): Promise<Buffer> {
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin))
    throw new DomainError(
      "PREVIEW_UNAVAILABLE",
      "The visual preview runtime is unavailable.",
      503,
    );
  const response = await fetch(`${origin}${previewDocumentPath}`, {
    // Next serves complete HTML for this bot-compatible local request. Screenshot
    // rendering does not depend on hydration or streamed inline scripts.
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": "RotaPress-Visual-Preview Twitterbot/1.0",
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("text/html") ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new DomainError(
      "PREVIEW_UNAVAILABLE",
      "The private renderer is unavailable. Retry after checking the application runtime.",
      503,
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8 * 1024 * 1024)
        throw new DomainError(
          "PREVIEW_TOO_LARGE",
          "This page is too large for visual preview.",
          413,
        );
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}
