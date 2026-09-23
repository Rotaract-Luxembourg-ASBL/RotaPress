import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Luma's documented HMAC over the signed timestamp and exact raw request bytes. */
export function verifyLumaWebhook(
  secret: string,
  header: string | null,
  body: Buffer,
  now = Date.now(),
) {
  if (!header || header.length > 200) return false;
  const parts = /^t=(\d{10}),\s*v1=([a-f0-9]{64})$/.exec(header);
  if (!parts) return false;
  const age = now / 1000 - Number(parts[1]);
  if (age > 300 || age < -60) return false;
  const expected = createHmac("sha256", secret)
    .update(`${parts[1]}.`)
    .update(body)
    .digest();
  return timingSafeEqual(expected, Buffer.from(parts[2], "hex"));
}
