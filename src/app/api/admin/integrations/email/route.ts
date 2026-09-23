import { z } from "zod";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { services } from "@/composition/services";

async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current) throw new HttpError(401, "Sign in to manage email.");
  return current;
}
export async function GET(request: Request) {
  return handle(async () =>
    json(await services.email.workspace(await actor(request))),
  );
}
export async function POST(request: Request) {
  return handle(async () => {
    const current = await actor(request);
    const { operation, values } = z
      .strictObject({
        operation: z.enum([
          "saveConnection",
          "testConnection",
          "useConnection",
          "deleteConnection",
          "saveTemplate",
          "publishTemplate",
        ]),
        values: z.unknown(),
      })
      .parse(await readMutation(request, 16384));
    await services.limiter.consume("email-settings", current.userId, 40);
    if (operation === "testConnection")
      await services.limiter.consume("email-test", current.userId, 3);
    return json(await services.email[operation](current, values));
  });
}
