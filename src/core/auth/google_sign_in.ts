import "server-only";
import { z } from "zod";
import { config } from "../config";
import { signInDestination } from "./sign_in_destination";

const destination = z
  .string()
  .max(1024)
  .refine((value) => {
    if (!URL.canParse(value, config.APP_URL)) return false;
    const url = new URL(value, config.APP_URL);
    return (
      url.origin === new URL(config.APP_URL).origin &&
      !url.hash &&
      !url.username &&
      !url.password &&
      ((url.pathname === "/sign-in" && !url.search) ||
        signInDestination(url.pathname + url.search) ===
          url.pathname + url.search)
    );
  }, "Choose a supported local sign-in destination.");

// Redirect OAuth is the supported flow. Tokens, scopes and state remain library/server owned.
export const googleSignInSchema = z
  .object({
    provider: z.literal("google"),
    callbackURL: destination.optional().default("/membership"),
    errorCallbackURL: destination.optional(),
    newUserCallbackURL: destination.optional(),
    disableRedirect: z.boolean().optional(),
  })
  .strict();
