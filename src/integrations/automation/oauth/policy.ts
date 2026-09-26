import { z } from "zod";
import { automationScopeSchema, connectionInput } from "../scopes";

export const oauthClientInput = z.strictObject({
  name: z.string().trim().min(2).max(80),
  redirectUris: z.array(z.url().max(1000)).min(1).max(3),
  scopes: z.array(automationScopeSchema).min(1).max(40),
  sourceOrigins: connectionInput.shape.sourceOrigins,
  authentication: z
    .enum(["client_secret_post", "none"])
    .default("client_secret_post"),
});
export const oauthClientMetadata = z.preprocess(
  (input) => {
    if (typeof input !== "string") return input;
    try {
      return JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  },
  z.strictObject({
    purpose: z.literal("rotapress-oauth-v1"),
    organizationId: z.uuid(),
    sourceOrigins: connectionInput.shape.sourceOrigins,
  }),
);
export const oauthConsentInput = z.strictObject({
  oauth_query: z.string().min(1).max(6000),
  accept: z.boolean(),
  scopes: z
    .array(z.union([automationScopeSchema, z.literal("offline_access")]))
    .max(41),
});

/** Exact callbacks only; loopback callbacks belong to local installations. */
export function validOAuthRedirect(value: string, appUrl: string): boolean {
  if (!URL.canParse(value) || value.includes("\\")) return false;
  const url = new URL(value);
  const localApp = ["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(appUrl).hostname,
  );
  const loopback =
    /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]+)?\//.test(value);
  return (
    !url.username &&
    !url.password &&
    !url.hash &&
    !url.search &&
    !url.hostname.includes("*") &&
    ((url.protocol === "https:" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) ||
      (localApp && loopback))
  );
}

export function oauthScopeList(value: string): string[] {
  return [...new Set(value.split(/\s+/).filter(Boolean))];
}
