import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { services } from "@/composition/services";
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage Calendar.");
    await services.limiter.consume("calendar-admin-read", actor.userId, 90);
    const path = (await context.params).path ?? [];
    if (path.join("/") === "sources")
      return json(await services.calendarSources.workspace(actor));
    if (path.length === 3 && path[0] === "sources" && path[2] === "review")
      return json(await services.calendarSources.review(actor, path[1]));
    if (path.length)
      throw new HttpError(404, "This Calendar view is unavailable.");
    return json(await services.calendar.workspace(actor));
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const body = await readMutation(request, 786432);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to manage Calendar.");
    await services.limiter.consume("calendar-admin-write", actor.userId, 40);
    const path = (await context.params).path?.join("/") ?? "";
    if (path === "sources/preview")
      return json(await services.calendarSources.preview(actor, body));
    if (path === "sources/fetch")
      return json(await services.calendarSources.fetchPreview(actor, body));
    if (path === "sources/create")
      return json(await services.calendarSources.create(actor, body));
    if (path === "sources/action")
      return json(await services.calendarSources.operation(actor, body));
    if (path === "schedules")
      return json(await services.calendar.schedule(actor, body));
    if (path === "page") return json(await services.calendar.page(actor, body));
    if (path === "") return json(await services.calendar.calendar(actor, body));
    throw new HttpError(404, "This Calendar action is unavailable.");
  });
}
