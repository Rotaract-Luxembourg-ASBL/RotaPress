import { z } from "zod";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

export async function POST(request: Request) {
  return handle(async () => {
    z.object({}).strict().parse(await readMutation(request));
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in before applying.");
    await services.limiter.consume("membership", actor.userId, 5);
    return json(await services.members.apply(actor), 201);
  });
}
