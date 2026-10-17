import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readBoundedBody, requireMutationOrigin } from "@/core/http";
import { UPLOAD_CHUNK_BYTES } from "@/features/media/media_schemas";
import { adminMediaAssetDto } from "@/features/media/media_admin";
import { requireContentGeneration } from "@/core/content/request_generation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function actor(request: Request, mutation = false) {
  if (mutation) { requireMutationOrigin(request); await requireContentGeneration(request); }
  const current = await getActor(request.headers);
  if (!current) throw new HttpError(401, "Sign in to continue this upload.");
  await services.authorization.require(current, "media.manage");
  return current;
}
export async function GET(request: Request, context: Context) {
  return handle(async () => json(await services.mediaUploads.status(await actor(request), (await context.params).id)));
}
export async function PUT(request: Request, context: Context) {
  return handle(async () => {
    const current = await actor(request, true);
    if (request.headers.get("content-type") !== "application/octet-stream") throw new HttpError(415, "Send a binary upload chunk.");
    const indexes = new URL(request.url).searchParams.getAll("chunk");
    if (indexes.length !== 1 || !/^(0|[1-9]\d{0,2})$/u.test(indexes[0])) throw new HttpError(400, "Choose a valid upload chunk.");
    const id = (await context.params).id;
    // Verify session ownership before accepting even one chunk into application memory.
    await services.mediaUploads.status(current, id);
    const bytes = await readBoundedBody(request, UPLOAD_CHUNK_BYTES);
    return json(await services.mediaUploads.putChunk(current, id, Number(indexes[0]), bytes));
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const current = await actor(request, true);
    return json(adminMediaAssetDto(await services.mediaUploads.finish(current, (await context.params).id)), 201);
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => json(await services.mediaUploads.cancel(await actor(request, true), (await context.params).id)));
}
