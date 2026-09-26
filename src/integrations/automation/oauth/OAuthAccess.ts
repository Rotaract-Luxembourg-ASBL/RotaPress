import "server-only";
import { z } from "zod";
import { auth } from "@/core/auth/server";
import { scheduledActor } from "@/core/auth/scheduled_actor";
import {
  DomainError,
  type AuthorizationService,
} from "@/core/authorization/AuthorizationService";
import type { RequestLimiter } from "@/core/RequestLimiter";
import type { AutomationPrincipal } from "../AutomationAccess";
import { automationScopeSchema } from "../scopes";
import {
  automationIssuer,
  automationResource,
} from "@/core/auth/automation_oauth";
import type { OAuthConnections } from "./OAuthConnections";

const claimsSchema = z.object({
  active: z.literal(true),
  iss: z.literal(automationIssuer),
  aud: z.union([
    z.literal(automationResource),
    z.tuple([z.literal(automationResource)]),
  ]),
  sub: z.string().min(1),
  sid: z.string().min(1),
  client_id: z.string().min(1),
  scope: z.string(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  token_type: z.literal("Bearer"),
  cnf: z.never().optional(),
});

export class OAuthAccess {
  constructor(
    private readonly connections: OAuthConnections,
    private readonly authorization: AuthorizationService,
    private readonly limiter: RequestLimiter,
  ) {}

  async authenticate(
    token: string,
    consumeQuota = true,
  ): Promise<AutomationPrincipal> {
    let claims: z.infer<typeof claimsSchema>;
    try {
      claims = claimsSchema.parse(
        await auth.api.validateAutomationOAuthToken({ body: { token } }),
      );
    } catch {
      throw new DomainError(
        "OAUTH_TOKEN_INVALID",
        "Reconnect your AI client using OAuth.",
        401,
      );
    }
    if (claims.exp * 1000 <= Date.now())
      throw new DomainError(
        "OAUTH_TOKEN_EXPIRED",
        "Reconnect your AI client using OAuth.",
        401,
      );
    const current = await scheduledActor(claims.sid, claims.sub);
    if (!current)
      throw new DomainError(
        "OAUTH_SESSION_EXPIRED",
        "Sign in again and reconnect your AI client.",
        401,
      );
    const scopes = claims.scope.split(" ").filter(Boolean);
    const metadata = await this.connections.authorizedClient(
      current.actor,
      claims.client_id,
      scopes,
      claims.iat,
    );
    const access = await this.authorization.require(
      current.actor,
      "admin.access",
    );
    if (metadata.organizationId !== access.organizationId)
      throw new DomainError(
        "OAUTH_SCOPE_CHANGED",
        "Reconnect your AI client.",
        401,
      );
    if (consumeQuota)
      await this.limiter.consume(
        "automation-request",
        `oauth:${claims.client_id}`,
        120,
      );
    return {
      actor: current.actor,
      keyId: `oauth:${claims.client_id}`,
      organizationId: access.organizationId,
      scopes: z
        .array(automationScopeSchema)
        .parse(scopes.filter((scope) => scope !== "offline_access")),
      sourceOrigins: metadata.sourceOrigins,
    };
  }
}
