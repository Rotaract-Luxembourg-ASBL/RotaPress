import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";

async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current) throw new HttpError(401, "Sign in to manage club features.");
  return current;
}
export async function GET(request: Request) {
  return handle(async () =>
    json(await services.features.workspace(await actor(request))),
  );
}
export async function POST(request: Request) {
  return handle(async () => {
    const input = await readMutation(request);
    return json(await services.features.configure(await actor(request), input));
  });
}
