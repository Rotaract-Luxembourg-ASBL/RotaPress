import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { z } from "zod";

async function requireActor(request: Request) {
  const actor = await getActor(request.headers);
  if (!actor)
    throw new HttpError(401, "Sign in to design the Events directory.");
  return actor;
}

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await requireActor(request);
    const locale = new URL(request.url).searchParams.get("locale") ?? "en";
    const workspace = await services.eventDirectory.workspace(actor, locale);
    return json({
      ...workspace,
      events: await services.eventWebsite.publicList(locale),
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const input = z
      .object({ action: z.enum(["save", "publish"]), input: z.unknown() })
      .strict()
      .parse(await readMutation(request));
    const actor = await requireActor(request);
    return json(
      input.action === "save"
        ? await services.eventDirectory.save(actor, input.input)
        : await services.eventDirectory.publish(actor, input.input),
    );
  });
}
