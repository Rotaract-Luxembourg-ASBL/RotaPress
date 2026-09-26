import "server-only";
import { z } from "zod";
import { and, count, eq, gt } from "drizzle-orm";
import { apikey } from "../../../db/schema/auth";
import { auth } from "@/core/auth/server";
import { scheduledActor } from "@/core/auth/scheduled_actor";
import {
  DomainError,
  type AuthorizationService,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import type { RequestLimiter } from "@/core/RequestLimiter";
import type { Database } from "@/infrastructure/database/client";
import { AuditRepository } from "@/core/audit/AuditRepository";
import { config } from "@/core/config";
import { authenticationAddress } from "@/core/auth/request_address";
import {
  automationScopeSchema,
  connectionInput,
  connectionMetadata,
  scopeDefinitions,
  type AutomationScope,
} from "./scopes";
import type { OAuthAccess } from "./oauth/OAuthAccess";

export type AutomationPrincipal = {
  actor: TrustedActor;
  keyId: string;
  organizationId: string;
  scopes: AutomationScope[];
  sourceOrigins: string[];
};

/** A key delegates a real, still-current Better Auth session; it never creates one. */
export class AutomationAccess {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly limiter: RequestLimiter,
    private readonly oauth?: OAuthAccess,
  ) {}

  async create(actor: TrustedActor, input: unknown) {
    const access = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    this.authorization.requireRecent(actor);
    const parsed = connectionInput.parse(input);
    for (const scope of parsed.scopes)
      await this.authorization.require(
        actor,
        scopeDefinitions[scope].capability,
      );
    if (parsed.scopes.includes("sources:read") && !parsed.sourceOrigins.length)
      throw new DomainError(
        "SOURCE_ORIGIN_REQUIRED",
        "Choose the reference websites this connection may read.",
        422,
      );
    await this.limiter.consume("automation-issue", actor.userId, 10);
    const [active] = await this.db
      .select({ count: count() })
      .from(apikey)
      .where(
        and(
          eq(apikey.referenceId, actor.userId),
          eq(apikey.enabled, true),
          gt(apikey.expiresAt, new Date()),
        ),
      );
    if (active.count >= 20)
      throw new DomainError(
        "AUTOMATION_CONNECTION_LIMIT",
        "Revoke an existing connection before creating another.",
        409,
      );
    const current = await scheduledActor(actor.sessionId, actor.userId);
    if (!current) this.unauthorized();
    const expiresIn = Math.min(
      parsed.expiresIn,
      Math.floor((current.expiresAt.getTime() - Date.now()) / 1000),
    );
    if (expiresIn < 300)
      throw new DomainError(
        "RECENT_AUTH_REQUIRED",
        "Sign in again before creating a connection.",
        401,
      );
    const result = await auth.api.createApiKey({
      body: {
        userId: actor.userId,
        name: parsed.name,
        expiresIn,
        permissions: { automation: [...new Set(parsed.scopes)] },
        metadata: {
          purpose: "rotapress-automation-v1",
          sessionId: actor.sessionId,
          organizationId: access.organizationId,
          sourceOrigins: parsed.sourceOrigins,
        },
      },
    });
    await new AuditRepository().record(this.db, {
      organizationId: access.organizationId,
      actorUserId: actor.userId,
      action: "automation.connection.created",
      targetId: result.id,
    });
    return {
      id: result.id,
      name: result.name,
      key: result.key,
      expiresAt: result.expiresAt,
    };
  }

  async list(actor: TrustedActor, headers: Headers) {
    await this.authorization.require(actor, "integrations.manage");
    const result = await auth.api.listApiKeys({
      headers,
      query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" },
    });
    return result.apiKeys.flatMap((key) => {
      const metadata = connectionMetadata.safeParse(key.metadata);
      if (!metadata.success) return [];
      return [
        {
          id: key.id,
          name: key.name,
          expiresAt: key.expiresAt,
          expired:
            key.expiresAt !== null && key.expiresAt.getTime() <= Date.now(),
          enabled: key.enabled,
          scopes: z
            .object({ automation: z.array(automationScopeSchema) })
            .parse(key.permissions).automation,
          sourceOrigins: metadata.data.sourceOrigins,
          currentSession: metadata.data.sessionId === actor.sessionId,
        },
      ];
    });
  }

  async revoke(actor: TrustedActor, headers: Headers, id: string) {
    const access = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    await auth.api.deleteApiKey({
      headers,
      body: { keyId: z.string().min(1).max(200).parse(id) },
    });
    await new AuditRepository().record(this.db, {
      organizationId: access.organizationId,
      actorUserId: actor.userId,
      action: "automation.connection.revoked",
      targetId: id,
    });
    return { revoked: true };
  }

  async authenticate(
    request: Request,
    options: { consumeQuota?: boolean } = {},
  ): Promise<AutomationPrincipal> {
    if (options.consumeQuota !== false)
      await this.limiter.consume(
        "automation-auth",
        authenticationAddress(request.headers, config.ROTAPRESS_PROXY),
        240,
      );
    const oauthBearer = /^Bearer (rpo_[A-Za-z0-9_-]{20,200})$/.exec(
      request.headers.get("authorization") ?? "",
    );
    if (oauthBearer && this.oauth)
      return this.oauth.authenticate(
        oauthBearer[1],
        options.consumeQuota !== false,
      );
    const bearer = /^Bearer (rp_[A-Za-z0-9_-]{20,200})$/.exec(
      request.headers.get("authorization") ?? "",
    );
    if (!bearer) this.unauthorized();
    const result = await auth.api.verifyApiKey({ body: { key: bearer[1] } });
    if (["RATE_LIMITED", "USAGE_EXCEEDED"].includes(result.error?.code ?? ""))
      throw new DomainError(
        "AUTOMATION_RATE_LIMITED",
        "Too many requests. Wait before trying again.",
        429,
      );
    if (!result.valid || !result.key) this.unauthorized();
    const metadata = connectionMetadata.safeParse(result.key.metadata);
    const permissions = z
      .object({ automation: z.array(automationScopeSchema) })
      .safeParse(result.key.permissions);
    if (!metadata.success || !permissions.success) this.unauthorized();
    const current = await scheduledActor(
      metadata.data.sessionId,
      result.key.referenceId,
    );
    if (!current) this.unauthorized();
    const access = await this.authorization.require(
      current.actor,
      "admin.access",
    );
    if (access.organizationId !== metadata.data.organizationId)
      this.unauthorized();
    if (options.consumeQuota !== false)
      await this.limiter.consume("automation-request", result.key.id, 120);
    return {
      actor: current.actor,
      keyId: result.key.id,
      organizationId: access.organizationId,
      scopes: permissions.data.automation,
      sourceOrigins: metadata.data.sourceOrigins,
    };
  }

  private unauthorized(): never {
    throw new DomainError(
      "AUTOMATION_AUTH_REQUIRED",
      "Use an unexpired AI & API key from a current staff session.",
      401,
    );
  }
}
