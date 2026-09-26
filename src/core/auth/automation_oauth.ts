import "server-only";
import {
  getOAuthProviderApi,
  getOAuthProviderState,
  type OAuthOptions,
} from "@better-auth/oauth-provider";
import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import { config } from "@/core/config";
import { scopeDefinitions } from "../authorization/automation_scopes";

export const automationResource = new URL("/api/mcp", config.APP_URL).href;
export const automationIssuer = new URL("/api/auth", config.APP_URL).href;
export const oauthOptions: OAuthOptions<string[]> = {
  loginPage: "/api/automation/oauth/sign-in",
  consentPage: "/oauth/consent",
  disableJwtPlugin: true,
  scopes: [...Object.keys(scopeDefinitions), "offline_access"],
  resources: [
    {
      identifier: automationResource,
      name: "RotaPress AI & API",
      allowedScopes: [...Object.keys(scopeDefinitions), "offline_access"],
    },
  ],
  // Refresh this application's resource catalogue when new actions are added.
  // Merge preserves unconfigured resource policy and never changes client grants.
  resourceSeedMode: "merge",
  grantTypes: ["authorization_code", "refresh_token"],
  enforcePerClientResources: true,
  clientRegistrationDefaultResources: [automationResource],
  allowDynamicClientRegistration: false,
  allowUnauthenticatedClientRegistration: false,
  accessTokenExpiresIn: 300,
  // Renewal follows the current staff session instead of forcing daily consent.
  refreshTokenExpiresIn: 60 * 60 * 24 * 7,
  // The provider returns the same encrypted response for a matching short retry.
  refreshTokenReuseInterval: 10,
  codeExpiresIn: 120,
  storeTokens: "hashed",
  prefix: { opaqueAccessToken: "rpo_", refreshToken: "rpr_" },
};

/** Library-owned validation in process; these helpers are never HTTP endpoints. */
export function automationOAuthValidation() {
  return {
    id: "rotapress-oauth-validation",
    endpoints: {
      validateAutomationOAuthToken: createAuthEndpoint(
        "/rotapress-oauth/validate",
        {
          method: "POST",
          body: z.object({ token: z.string().max(256) }),
          metadata: { SERVER_ONLY: true },
        },
        async (ctx) =>
          getOAuthProviderApi(ctx, oauthOptions).requireActiveAccessToken(
            ctx.body.token,
          ),
      ),
      readAutomationOAuthRequest: createAuthEndpoint(
        "/rotapress-oauth/request",
        {
          method: "POST",
          body: z.object({ oauth_query: z.string().max(6000) }),
          metadata: { SERVER_ONLY: true },
        },
        async () => ({ query: (await getOAuthProviderState())?.query ?? "" }),
      ),
    },
  };
}
