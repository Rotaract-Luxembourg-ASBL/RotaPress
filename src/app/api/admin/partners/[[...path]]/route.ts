import { z } from "zod";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

type Context = { params: Promise<{ path?: string[] }> };
async function actorFor(request: Request) {
  const actor = await getActor(request.headers);
  if (!actor) throw new HttpError(401, "Sign in to manage partners.");
  return actor;
}
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    if (!path.length)
      return json({ items: await services.partners.list(actor) });
    if (path.length === 1 && path[0] === "selection") {
      const eventId = new URL(request.url).searchParams.get("eventId");
      if (eventId) {
        z.uuid().parse(eventId);
        const event = await services.events.detail(actor, eventId);
        services.events.requireCapability(event, "events.edit");
      } else await services.authorization.require(actor, "cms.edit");
      const { organizationId } = await services.authorization.approved(actor);
      return json({
        items: await services.partners.publishedSelection(organizationId),
      });
    }
    throw new HttpError(404, "Partner operation not found.");
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const actor = await actorFor(request);
    const path = (await context.params).path ?? [];
    const body = await readMutation(request);
    await services.limiter.consume("partners-write", actor.userId, 60);
    if (!path.length)
      return json(await services.partners.create(actor, body), 201);
    if (path.length === 2) {
      const operation = z
        .enum(["save", "publish", "unpublish", "restore"])
        .parse(path[1]);
      return json(
        await services.partners.change(actor, path[0], operation, body),
      );
    }
    throw new HttpError(404, "Partner operation not found.");
  });
}
