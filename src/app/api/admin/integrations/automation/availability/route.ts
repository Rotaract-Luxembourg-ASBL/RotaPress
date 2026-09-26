import { automationAvailability } from "@/composition/automation";
import { getActor } from "@/core/auth/actor";
import {
  handle,
  HttpError,
  json,
  readMutation,
  requireMutationOrigin,
} from "@/core/http";

async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current) throw new HttpError(401, "Sign in to manage integrations.");
  return current;
}
export function GET(request: Request) {
  return handle(async () =>
    json({ items: await automationAvailability.list(await actor(request)) }),
  );
}
export function POST(request: Request) {
  return handle(async () => {
    requireMutationOrigin(request);
    const current = await actor(request);
    return json(
      await automationAvailability.change(
        current,
        await readMutation(request, 1024),
      ),
    );
  });
}
