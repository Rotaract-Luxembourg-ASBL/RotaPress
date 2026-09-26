import { z } from "zod";
import { getActor } from "@/core/auth/actor";
import { oauthConnections } from "@/composition/automation";
import { handle, HttpError, json, readMutation } from "@/core/http";

async function actor(request: Request) {
  const result = await getActor(request.headers);
  if (!result) throw new HttpError(401, "Sign in to manage OAuth connections.");
  return result;
}
export function GET(request: Request) {
  return handle(async () =>
    json({ clients: await oauthConnections.list(await actor(request)) }),
  );
}
export function POST(request: Request) {
  return handle(async () =>
    json(
      await oauthConnections.create(
        await actor(request),
        request.headers,
        await readMutation(request, 8192),
      ),
    ),
  );
}
export function DELETE(request: Request) {
  return handle(async () => {
    const current = await actor(request);
    const { clientId } = z
      .strictObject({ clientId: z.string().min(1).max(200) })
      .parse(await readMutation(request, 1024));
    return json(
      await oauthConnections.revoke(current, request.headers, clientId),
    );
  });
}
