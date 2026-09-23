import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { services } from "@/composition/services";

async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current) throw new HttpError(401, "Sign in to manage email templates.");
  return current;
}
export async function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    return json(
      await services.emailTemplates.workspace(await actor(request), {
        kind: params.get("kind"),
        id: params.get("id"),
      }),
    );
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const current = await actor(request);
    const body = await readMutation(request);
    await services.limiter.consume("email-template", current.userId, 40);
    return json(await services.emailTemplates.change(current, body));
  });
}
