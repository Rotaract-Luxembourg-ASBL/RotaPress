import { services } from "@/composition/services";
import { DomainError } from "@/core/authorization/AuthorizationService";
import { handle, HttpError, json, readBoundedBody } from "@/core/http";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    // One installation-wide key; unknown endpoint IDs cannot create unbounded limiter rows.
    await services.limiter.consume("luma-webhook", "installation", 120);
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      throw new HttpError(415, "Use a JSON webhook request.");
    const { id } = await context.params;
    const body = await readBoundedBody(request, 262_144);
    try {
      return json(
        await services.lumaWebhook.receive(
          id,
          request.headers.get("webhook-signature"),
          body,
        ),
        202,
      );
    } catch (error) {
      // A local pause is temporary; avoid 410, which pauses the subscription at Luma.
      if (error instanceof DomainError && error.code === "WEBHOOK_PAUSED")
        return json({ error: "Webhook reception is paused." }, 503);
      throw error;
    }
  });
}
