import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json } from "@/core/http";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    if (!actor)
      throw new HttpError(401, "Sign in to view contacts and responses.");
    return json(
      await services.inbox.list(
        actor,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
  });
}
