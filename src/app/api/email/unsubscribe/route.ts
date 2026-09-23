import { z } from "zod";
import { handle, json, readMutation } from "@/core/http";
import { services } from "@/composition/services";

export async function POST(request: Request) {
  return handle(async () => {
    // No cookie or login is authority here. The scoped email capability is required.
    const body = z
      .strictObject({ token: z.string().max(150) })
      .parse(await readMutation(request, 512));
    const scope = services.calendarEmailPreferences.validate(body);
    // Reject forged capabilities before creating rate-limit rows.
    await services.limiter.consume("email-unsubscribe", scope.id, 20);
    return json(await services.calendarEmailPreferences.unsubscribe(body));
  });
}
