import { z } from "zod";
import { automationProposals } from "@/integrations/automation/proposal_service";
import { getActor } from "@/core/auth/actor";
import {
  handle,
  HttpError,
  json,
  readMutation,
  requireMutationOrigin,
} from "@/core/http";
import { services } from "@/composition/services";

async function actor(request: Request) {
  const current = await getActor(request.headers);
  if (!current)
    throw new HttpError(401, "Sign in to review event suggestions.");
  await services.authorization.require(current, "integrations.manage");
  return current;
}
export function GET(request: Request) {
  return handle(async () =>
    json({
      items: await automationProposals.list(
        await actor(request),
        z.uuid().parse(new URL(request.url).searchParams.get("eventId")),
      ),
    }),
  );
}
export function POST(request: Request) {
  return handle(async () => {
    requireMutationOrigin(request);
    const current = await actor(request);
    await services.limiter.consume(
      "automation-proposal-review",
      current.userId,
      30,
    );
    return json(
      await automationProposals.review(
        current,
        await readMutation(request, 1024),
      ),
    );
  });
}
