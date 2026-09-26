import { HttpError } from "@/core/http";
import { MAX_UPLOAD_BYTES } from "@/features/media/media_schemas";

/** Larger binary bodies also need a deadline so slow streams cannot hold image slots. */
export async function readMediaBody(
  request: Request,
  deadlineMs = 20_000,
): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is required.");
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, deadlineMs);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut)
        throw new HttpError(
          408,
          "The image upload took too long. Retry with the same request ID.",
        );
      if (done) return Buffer.concat(chunks);
      total += value.byteLength;
      if (total > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "The image upload exceeds 5 MiB.");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
