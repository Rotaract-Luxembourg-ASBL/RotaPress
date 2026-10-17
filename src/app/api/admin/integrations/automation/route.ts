import { z } from "zod";
import { automationAccess } from "@/composition/automation";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current)
    throw new HttpError(401, "Sign in to manage integration credentials.");
  return current;
}
export function GET(request: Request) {
  return handle(async () =>
    json(
      await automationAccess.list(
        await actor(request),
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    ),
  );
}
export function POST(request: Request) {
  return handle(async () =>
    json(
      await automationAccess.create(
        await actor(request),
        await readMutation(request, 4096),
      ),
    ),
  );
}
export function DELETE(request: Request) {
  return handle(async () => {
    const current = await actor(request);
    const { id } = z
      .strictObject({ id: z.string().min(1).max(200) })
      .parse(await readMutation(request, 1024));
    return json(await automationAccess.revoke(current, request.headers, id));
  });
}
