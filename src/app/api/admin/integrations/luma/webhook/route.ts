import { z } from "zod";
import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current) throw new HttpError(401, "Sign in to manage integrations.");
  return current;
}
export async function GET(request: Request) {
  return handle(async () =>
    json(await services.lumaWebhook.workspace(await actor(request))),
  );
}
export async function POST(request: Request) {
  return handle(async () => {
    const current = await actor(request);
    const { operation, values } = z
      .object({
        operation: z.enum(["generate", "save", "pause", "remove"]),
        values: z.unknown(),
      })
      .strict()
      .parse(await readMutation(request, 2048));
    return json(
      await services.lumaWebhook.configure(current, operation, values),
    );
  });
}
