import "server-only";
import { z } from "zod";
import { config } from "../config";
import { signInDestination } from "./sign_in_destination";

function localURL(value: string): URL | null {
  if (!URL.canParse(value, config.APP_URL)) return null;
  const url = new URL(value, config.APP_URL);
  return url.origin === new URL(config.APP_URL).origin &&
    !url.hash &&
    !url.username &&
    !url.password
    ? url
    : null;
}

function supportedDestination(value: string): boolean {
  const url = localURL(value);
  if (!url) return false;
  const path = url.pathname + url.search;
  return (
    (url.pathname === "/sign-in" && !url.search) ||
    signInDestination(path) === path
  );
}

function signInRecovery(value: string): boolean {
  const url = localURL(value);
  if (!url || url.pathname !== "/sign-in") return false;
  const query = url.searchParams;
  // Better Auth appends provider errors after validating its own OAuth state.
  if (
    [...query.keys()].some(
      (key) =>
        !["next", "reauth"].includes(key) || query.getAll(key).length !== 1,
    )
  )
    return false;
  const next = query.get("next");
  return (
    next !== null &&
    signInDestination(next) === next &&
    (!query.has("reauth") || query.get("reauth") === "1")
  );
}

const destination = z
  .string()
  .max(1024)
  .refine(
    supportedDestination,
    "Choose a supported local sign-in destination.",
  );
const errorDestination = z
  .string()
  .max(1024)
  .refine(
    (value) => supportedDestination(value) || signInRecovery(value),
    "Choose a supported local sign-in recovery destination.",
  );

// Redirect OAuth is the supported flow. Tokens, scopes and state remain library/server owned.
export const googleSignInSchema = z
  .object({
    provider: z.literal("google"),
    callbackURL: destination.optional().default("/membership"),
    errorCallbackURL: errorDestination.optional(),
    newUserCallbackURL: destination.optional(),
    disableRedirect: z.boolean().optional(),
  })
  .strict();
