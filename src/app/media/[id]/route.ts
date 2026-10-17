import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle } from "@/core/http";
import { deliverMedia } from "@/features/media/media_delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    const id = (await context.params).id;
    return deliverMedia(services.media, actor, id, request);
  });
}
export const HEAD = GET;
