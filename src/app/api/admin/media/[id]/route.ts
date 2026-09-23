import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation, requireMutationOrigin } from "@/core/http";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage media.");
    return json(await services.media.usage(actor, (await context.params).id));
  });
}

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const body = z.record(z.string(), z.unknown()).parse(await readMutation(request));
    if ("id" in body) throw new HttpError(400, "Image identity belongs in the URL.");
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage media.");
    const { id } = await context.params;
    return json(await services.media.update(actor, { ...body, id }));
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    requireMutationOrigin(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage media.");
    await services.media.delete(actor, (await context.params).id);
    return json({ deleted: true });
  });
}
