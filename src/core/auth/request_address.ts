import { isIP } from "node:net";

/** Enable only behind a private upstream whose edge overwrites X-Real-IP.
 * The supplied Caddy recipe does this. Browser forwarding chains are ignored. */
export function authenticationAddress(
  headers: Headers,
  proxy: "none" | "trusted",
) {
  if (proxy === "trusted") {
    const address = headers.get("x-real-ip")?.trim() ?? "";
    if (isIP(address)) return address;
  }
  return "127.0.0.1";
}

function canonicalAddress(value: string | null | undefined) {
  const address = value?.trim() ?? "";
  const family = isIP(address);
  if (!family) return null;
  return family === 6 ? new URL(`http://[${address}]`).hostname : address;
}

/** Compare with the library's sign-in snapshot, not sliding session updatedAt.
 * Forwarded IPs are useful only behind the configured, overwriting proxy.
 * A missing legacy snapshot cannot establish a network/browser change.
 */
export function sessionContextChanged(
  session: { ipAddress?: string | null; userAgent?: string | null },
  headers: Headers,
  proxy: "none" | "trusted",
): boolean {
  if (session.userAgent && session.userAgent !== headers.get("user-agent"))
    return true;
  const original = canonicalAddress(session.ipAddress);
  return proxy === "trusted" && original !== null
    ? original !== canonicalAddress(headers.get("x-real-ip"))
    : false;
}
