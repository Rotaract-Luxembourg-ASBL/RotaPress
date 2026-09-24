import { services } from "@/composition/services";
import { emailDelivery } from "@/composition/email";
import { getActor } from "@/core/auth/actor";
import { googleAuthStore } from "@/core/auth/google_configuration";
import { handle, json } from "@/core/http";
import { featureForCapability } from "@/core/features/feature_catalogue";
import { readSetupClaim } from "@/core/installation/setup_cookie";

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await getActor(request.headers);
    const access = await services.authorization.optional(actor);
    const eventAccess = await services.events.hasAccess(actor);
    const responseAccess =
      eventAccess && (await services.events.hasResponseAccess(actor));
    const features = await services.authorization.features.installed();
    const installed = await services.installation.isComplete();
    return json({
      actor: actor ? { email: actor.email } : null,
      membership: actor ? await services.members.own(actor) : null,
      capabilities: [
        ...(access?.capabilities ?? []),
        ...(eventAccess ? ["events.access"] : []),
        ...(responseAccess ? ["events.responses.access"] : []),
      ].filter((capability) => {
        const key = featureForCapability(capability);
        return !key || features[key];
      }),
      features,
      installed,
      setupEmailReady: emailDelivery.serverStatus().ready,
      setupClaimReady:
        !installed &&
        (await services.installation.acceptsClaim(
          readSetupClaim(request.headers),
        )),
      googleConfigured: await googleAuthStore.enabled(),
    });
  });
}
