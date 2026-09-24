import { z } from "zod";
import { services } from "@/composition/services";
import { config } from "@/core/config";
import { handle, HttpError, json, readMutation } from "@/core/http";
import { setupCookie } from "@/core/installation/setup_cookie";

/** Exchanges an operator-issued URL fragment for a private cookie. This does
 * not create claims, authenticate a user, or grant membership/ownership. */
export async function POST(request: Request) {
  return handle(async () => {
    const { claim } = z
      .strictObject({ claim: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .parse(await readMutation(request, 512));
    await services.limiter.consume("setup-link", "installation", 10);
    if (!(await services.installation.acceptsClaim(claim)))
      throw new HttpError(
        409,
        "This setup link has expired or has already been used. Reopen the hosting assistant to get a new link.",
      );
    const response = json({ ready: true });
    response.headers.set(
      "Set-Cookie",
      setupCookie(claim, config.APP_URL.startsWith("https:")),
    );
    return response;
  });
}
