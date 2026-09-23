import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

type Context = { params: Promise<{ path?: string[] }> };
async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current)
    throw new HttpError(
      401,
      "Sign in with the email address invited by the event team.",
    );
  return current;
}
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const current = await actor(request);
    await services.limiter.consume("guest-read", current.userId, 90);
    const path = (await context.params).path ?? [];
    if (path.length === 3 && path[2] === "purchases")
      return json(await services.purchases.mine(current, path[0], path[1]));
    if (path.length === 4 && path[2] === "purchases" && path[3] === "receipt")
      return new Response(
        await services.purchases.receipt(current, path[0], path[1]),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="purchase-summary.txt"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    if (!path.length)
      return json({ invitations: await services.guests.mine(current) });
    if (path.length === 2)
      return json(await services.guests.portal(current, path[0], path[1]));
    throw new HttpError(404, "This guest page is unavailable.");
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const input = await readMutation(request);
    const current = await actor(request);
    await services.limiter.consume("guest-claim", current.userId, 20);
    const path = (await context.params).path ?? [];
    if (path.length === 3 && path[2] === "claim")
      return json(
        await services.guests.claim(current, path[0], path[1], input),
      );
    throw new HttpError(404, "This guest operation is unavailable.");
  });
}
