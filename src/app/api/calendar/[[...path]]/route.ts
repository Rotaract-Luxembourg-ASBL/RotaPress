import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { services } from "@/composition/services";
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    await services.limiter.consume(
      "calendar-read",
      actor?.userId ?? "public",
      240,
    );
    const path = (await context.params).path?.join("/") ?? "";
    if (path === "catalogue")
      return json({
        items: (
          await services.calendar.reader.visible(actor?.userId ?? null)
        ).map(({ id, name, audience }) => ({ id, name, audience })),
      });
    if (path === "subscriptions") {
      if (!actor)
        throw new HttpError(401, "Sign in to manage your subscriptions.");
      return json(await services.calendarSubscriptions.workspace(actor));
    }
    const query = new URL(request.url).searchParams;
    if (path !== "")
      throw new HttpError(404, "This Calendar view is unavailable.");
    return json(
      await services.calendar.reader.feed(actor, {
        from: query.get("from"),
        to: query.get("to"),
        calendarIds: query.get("calendars")?.split(",").filter(Boolean) ?? [],
        timezone: query.get("timezone") ?? "Europe/Luxembourg",
      }),
    );
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const body = await readMutation(request);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in to subscribe to calendars.");
    await services.limiter.consume("calendar-subscribe", actor.userId, 20);
    const path = (await context.params).path?.join("/");
    if (path === "subscriptions")
      return json(await services.calendarSubscriptions.save(actor, body));
    if (path === "read")
      return json(await services.calendarSubscriptions.read(actor, body));
    throw new HttpError(404, "This Calendar action is unavailable.");
  });
}
