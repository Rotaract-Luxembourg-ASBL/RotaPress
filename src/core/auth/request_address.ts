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
