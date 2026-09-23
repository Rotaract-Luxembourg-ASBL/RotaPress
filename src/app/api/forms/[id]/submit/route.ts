import { services } from "@/composition/services";
import { getActor } from "@/core/auth/actor";
import { handle, json, readMutation, requireMutationOrigin } from "@/core/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    requireMutationOrigin(request);
    // This loopback release has no trusted proxy identity. The fixed shared
    // bucket remains effective when forwarded headers or form IDs vary.
    await services.limiter.consume("form-submit-global", "local", 120);
    const input = await readMutation(request, 64 * 1024);
    const { id } = await context.params;
    const actor = await getActor(request.headers);
    if (actor)
      await services.limiter.consume("form-submit-actor", actor.userId, 30);
    const receipt = await services.submissions.submit(actor, id, input);
    return json(receipt, receipt.duplicate ? 200 : 201);
  });
}
