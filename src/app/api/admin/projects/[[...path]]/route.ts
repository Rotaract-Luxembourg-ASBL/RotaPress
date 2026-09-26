import { z } from "zod";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

type Context = { params: Promise<{ path?: string[] }> };
async function actorFor(request: Request) {
  const actor = await getActor(request.headers);
  if (!actor) throw new HttpError(401, "Sign in to manage projects.");
  return actor;
}

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    if (!path.length)
      return json({ items: await services.projects.list(actor) });
    if (path.length === 1)
      return json(await services.projects.detail(actor, path[0]));
    throw new HttpError(404, "Project operation not found.");
  });
}

export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    const body = await readMutation(request, 131_072);
    await services.limiter.consume("projects-write", actor.userId, 60);
    if (!path.length)
      return json(await services.projects.create(actor, body), 201);
    if (path.length === 2) {
      const operation = z
        .enum(["publish", "unpublish", "archive", "restore"])
        .parse(path[1]);
      return json(
        await services.projects.change(actor, path[0], operation, body),
      );
    }
    throw new HttpError(404, "Project operation not found.");
  });
}

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    const body = await readMutation(request, 131_072);
    await services.limiter.consume("projects-write", actor.userId, 60);
    if (path.length === 1)
      return json(await services.projects.change(actor, path[0], "save", body));
    throw new HttpError(404, "Project operation not found.");
  });
}
