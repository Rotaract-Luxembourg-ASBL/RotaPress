import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readBoundedBody, readMutation, requireMutationOrigin } from "@/core/http";
import { adminMediaAssetDto } from "@/features/media/media_admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to use the media library.");
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) {
      throw new HttpError(400, "Use each gallery filter once.");
    }
    return json(await services.media.adminList(actor, Object.fromEntries(params)));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in before uploading.");
    await services.authorization.require(actor, "media.manage");
    await services.limiter.consume("media-upload", actor.userId, 120);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;")) {
      throw new HttpError(415, "Choose an image to upload.");
    }
    const bytes = await readBoundedBody(request, 5 * 1024 * 1024 + 16_384);
    let form: FormData;
    try {
      form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType } }).formData();
    } catch { throw new HttpError(400, "The upload form could not be read."); }
    const allowed = new Set(["file", "title", "alt", "caption", "collection", "visibility", "requestId"]);
    for (const key of form.keys()) {
      if (!allowed.has(key) || form.getAll(key).length !== 1) throw new HttpError(400, "Unexpected upload field.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose one image to upload.");
    const text = (key: string) => {
      const value = form.get(key);
      if (value !== null && typeof value !== "string") throw new HttpError(400, "Invalid image metadata.");
      return value ?? undefined;
    };
    return json(adminMediaAssetDto(await services.media.uploadFromAdministration(actor, {
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      title: text("title"), alt: text("alt"), caption: text("caption"), collection: text("collection"),
      visibility: text("visibility") ?? "public",
      requestId: text("requestId"),
    })), 201);
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage media.");
    const assets = await services.media.updateBatch(actor, await readMutation(request, 65_536));
    return json({ assets: assets.map(adminMediaAssetDto) });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage media.");
    return json({ deletedIds: await services.media.deleteBatch(actor, await readMutation(request, 65_536)) });
  });
}
