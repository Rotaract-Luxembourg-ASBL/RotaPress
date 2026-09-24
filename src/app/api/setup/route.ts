import { services } from "@/composition/services";
import { emailDelivery } from "@/composition/email";
import { getActor } from "@/core/auth/actor";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { config } from "@/core/config";
import { readSetupClaim, setupCookie } from "@/core/installation/setup_cookie";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readMutation(request);
    await services.limiter.consume("setup", "installation", 10);
    const actor = await getActor(request.headers);
    if (!actor) throw new HttpError(401, "Sign in before completing setup.");
    emailDelivery.requireServerConnection();
    const input =
      body && typeof body === "object" && !Array.isArray(body)
        ? {
            ...body,
            claim:
              "claim" in body && body.claim
                ? body.claim
                : readSetupClaim(request.headers),
          }
        : body;
    const response = json(
      await services.installation.complete(actor, input),
      201,
    );
    response.headers.set(
      "Set-Cookie",
      setupCookie("", config.APP_URL.startsWith("https:")),
    );
    return response;
  });
}
