import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle } from "@/core/http";
import { imageThumbnail } from "@/features/media/image_preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    const id = (await context.params).id;
    const asset = await services.media.read(actor, id);
    const thumbnail =
      new URL(request.url).searchParams.get("variant") === "thumbnail";
    const bytes = thumbnail ? await imageThumbnail(asset.bytes) : asset.bytes;
    // Recheck current visibility/access after queued decoding, before delivery.
    if (thumbnail) await services.media.read(actor, id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": 'inline; filename="image.webp"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}
