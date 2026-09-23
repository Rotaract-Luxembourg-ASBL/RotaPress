import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle } from "@/core/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    const asset = await services.media.read(actor, (await context.params).id);
    return new Response(new Uint8Array(asset.bytes), { headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.bytes.byteLength),
      "Content-Disposition": 'inline; filename="image.webp"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  });
}
