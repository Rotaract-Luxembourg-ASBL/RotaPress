import "server-only";
import { deflateRawSync, inflateRawSync } from "node:zlib";

export const pendingOAuthCookie = "rotapress_oauth_request";
export function encodePendingOAuth(query: string): string {
  if (!query || query.length > 6000) throw new Error("Invalid OAuth request.");
  const encoded = deflateRawSync(Buffer.from(query)).toString("base64url");
  if (encoded.length > 3000) throw new Error("OAuth request is too large.");
  return encoded;
}
export function decodePendingOAuth(value: string | undefined): string | null {
  if (!value || value.length > 3000 || !/^[A-Za-z0-9_-]+$/.test(value))
    return null;
  try {
    return inflateRawSync(Buffer.from(value, "base64url"), {
      maxOutputLength: 6000,
    }).toString("utf8");
  } catch {
    return null;
  }
}
