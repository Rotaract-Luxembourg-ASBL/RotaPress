import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { oauthClient, oauthConsent } from "../../../../db/schema/oauth";
import { auth } from "@/core/auth/server";
import type {
  AuthorizationService,
  DatabaseExecutor,
  TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { DomainError } from "@/core/DomainError";
import { AuditRepository } from "@/core/audit/AuditRepository";
import type { RequestLimiter } from "@/core/RequestLimiter";
import type { Database } from "@/infrastructure/database/client";
import { config } from "@/core/config";
import type { AutomationAvailability } from "../AutomationAvailability";
import { automationScopeSchema, scopeDefinitions } from "../scopes";
import { automationResource } from "@/core/auth/automation_oauth";
import {
  oauthClientInput,
  oauthClientMetadata,
  oauthConsentInput,
  oauthScopeList,
  oauthPermissionsInput,
  oauthReviewInput,
  validOAuthRedirect,
} from "./policy";
import { replaceOAuthPermissions } from "./permission_store";
import { connectionHistory, recentConnectionActivity } from "./activity";
import { withOAuthGrantLock } from "./grant_lock";

export class OAuthConnections {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly limiter: RequestLimiter,
    private readonly availability: AutomationAvailability,
  ) {}

  async create(actor: TrustedActor, headers: Headers, input: unknown) {
    const access = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    this.authorization.requireRecent(actor);
    const parsed = oauthClientInput.parse(input);
    if (
      parsed.redirectUris.some(
        (uri) => !validOAuthRedirect(uri, config.APP_URL),
      )
    )
      throw new DomainError(
        "OAUTH_REDIRECT_INVALID",
        "Use exact HTTPS callback URLs without query strings, credentials or fragments. Local installations also allow exact loopback HTTP callbacks.",
        422,
      );
    await this.checkScopes(actor, parsed.scopes);
    if (parsed.scopes.includes("sources:read") && !parsed.sourceOrigins.length)
      throw new DomainError(
        "SOURCE_ORIGIN_REQUIRED",
        "Choose the reference websites this connection may read.",
        422,
      );
    await this.limiter.consume("oauth-client-create", actor.userId, 10);
    const [active] = await this.db
      .select({ count: count() })
      .from(oauthClient)
      .where(
        and(
          eq(oauthClient.userId, actor.userId),
          eq(oauthClient.disabled, false),
        ),
      );
    if (active.count >= 20)
      throw new DomainError(
        "OAUTH_CLIENT_LIMIT",
        "Revoke an existing OAuth connection before creating another.",
        409,
      );
    const result = await auth.api.adminCreateOAuthClient({
      headers,
      body: {
        client_name: parsed.name,
        redirect_uris: [...new Set(parsed.redirectUris)],
        token_endpoint_auth_method: parsed.authentication,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        application_type: parsed.redirectUris.some((uri) =>
          uri.startsWith("http:"),
        )
          ? "native"
          : "web",
        scope: [...new Set(parsed.scopes), "offline_access"].join(" "),
        require_pkce: true,
        skip_consent: false,
        metadata: {
          purpose: "rotapress-oauth-v1",
          organizationId: access.organizationId,
          sourceOrigins: parsed.sourceOrigins,
        },
      },
    });
    await this.audit(
      actor,
      access.organizationId,
      "automation.oauth.created",
      result.client_id,
    );
    return {
      clientId: result.client_id,
      clientSecret: result.client_secret,
      resource: automationResource,
    };
  }

  async list(actor: TrustedActor) {
    const access = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    const clients = await this.db
      .select({
        clientId: oauthClient.clientId,
        name: oauthClient.name,
        disabled: oauthClient.disabled,
        redirectUris: oauthClient.redirectUris,
        scopes: oauthClient.scopes,
        createdAt: oauthClient.createdAt,
        metadata: oauthClient.metadata,
        authentication: oauthClient.tokenEndpointAuthMethod,
      })
      .from(oauthClient)
      .where(eq(oauthClient.userId, actor.userId))
      .orderBy(desc(oauthClient.createdAt))
      .limit(100);
    const history = await connectionHistory(
      this.db,
      access.organizationId,
      actor.userId,
      clients.map((client) => client.clientId),
    );
    return clients.flatMap((client) => {
      const metadata = oauthClientMetadata.safeParse(client.metadata);
      if (
        !metadata.success ||
        metadata.data.organizationId !== access.organizationId
      )
        return [];
      const consent = history.consents.find(
        (item) => item.clientId === client.clientId,
      );
      const lastUsedAt =
        history.latest.find(
          (item) => item.targetId === `oauth:${client.clientId}`,
        )?.at ?? null;
      return [
        {
          clientId: client.clientId,
          name: client.name,
          disabled: Boolean(client.disabled),
          redirectUris: client.redirectUris,
          scopes: (client.scopes ?? []).filter(
            (scope) => automationScopeSchema.safeParse(scope).success,
          ),
          sourceOrigins: metadata.data.sourceOrigins,
          createdAt: client.createdAt,
          authentication: client.authentication,
          permissionsRevision: metadata.data.permissionsRevision ?? "initial",
          approvedScopes: (consent?.scopes ?? []).filter(
            (scope) => automationScopeSchema.safeParse(scope).success,
          ),
          consentedAt: consent?.at ?? null,
          lastUsedAt,
        },
      ];
    });
  }

  async revoke(actor: TrustedActor, headers: Headers, clientId: string) {
    return withOAuthGrantLock(this.db, async (tx) => {
      const client = await this.ownedClient(actor, clientId);
      await auth.api.deleteOAuthClient({
        headers,
        body: { client_id: clientId },
      });
      await this.audit(
        actor,
        client.metadata.organizationId,
        "automation.oauth.revoked",
        clientId,
        tx,
      );
      return { revoked: true };
    });
  }

  async activity(actor: TrustedActor, clientId: string) {
    const client = await this.ownedClient(actor, clientId);
    return recentConnectionActivity(
      this.db,
      client.metadata.organizationId,
      actor.userId,
      clientId,
    );
  }

  async updatePermissions(actor: TrustedActor, input: unknown) {
    await this.authorization.require(actor, "integrations.manage");
    this.authorization.requireRecent(actor);
    const parsed = oauthPermissionsInput.parse(input);
    return withOAuthGrantLock(this.db, async (tx) => {
      const client = await this.ownedClient(actor, parsed.clientId);
      if (
        (client.metadata.permissionsRevision ?? "initial") !==
        parsed.expectedRevision
      )
        throw new DomainError(
          "OAUTH_PERMISSIONS_CHANGED",
          "Permissions changed in another tab. Reload this connection before saving again.",
          409,
        );
      await this.checkScopes(actor, parsed.scopes);
      if (
        parsed.scopes.includes("sources:read") &&
        !parsed.sourceOrigins.length
      )
        throw new DomainError(
          "SOURCE_ORIGIN_REQUIRED",
          "Choose the reference websites this connection may read.",
          422,
        );
      const scopes = [...new Set(parsed.scopes)];
      const sourceOrigins = scopes.includes("sources:read")
        ? [...new Set(parsed.sourceOrigins)]
        : [];
      const revision = await replaceOAuthPermissions(parsed.clientId, scopes, {
        ...client.metadata,
        sourceOrigins,
      });
      await this.audit(
        actor,
        client.metadata.organizationId,
        "automation.oauth.permissions_updated",
        parsed.clientId,
        tx,
      );
      return {
        saved: true,
        permissionsRevision: revision,
        reconnectRequired: true,
      };
    });
  }

  async details(actor: TrustedActor, headers: Headers, signedQuery: string) {
    await this.authorization.require(actor, "integrations.manage");
    await this.availability.requireEnabled("mcp");
    const verified = await auth.api.readAutomationOAuthRequest({
      headers,
      body: { oauth_query: signedQuery },
    });
    const query = new URLSearchParams(verified.query);
    const client = await this.ownedClient(actor, query.get("client_id") ?? "");
    const scopes = oauthScopeList(query.get("scope") ?? "");
    if (
      query.getAll("resource").length !== 1 ||
      query.get("resource") !== automationResource ||
      !scopes.length ||
      scopes.some((scope) => !(client.record.scopes ?? []).includes(scope))
    )
      throw new DomainError(
        "OAUTH_REQUEST_INVALID",
        "Start this connection again from your AI client.",
        400,
      );
    await this.checkScopes(actor, scopes);
    const consent = await this.currentConsent(actor, client.record.clientId);
    const approvedScopes = consent?.resources?.includes(automationResource)
      ? consent.scopes
      : [];
    let recentlyAuthenticated = true;
    try {
      this.authorization.requireRecent(actor);
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== "RECENT_AUTH_REQUIRED"
      )
        throw error;
      recentlyAuthenticated = false;
    }
    return {
      clientId: client.record.clientId,
      name: client.record.name ?? "AI client",
      scopes,
      allowedScopes: (client.record.scopes ?? []).filter(
        (scope) =>
          scope === "offline_access" ||
          automationScopeSchema.safeParse(scope).success,
      ),
      sourceOrigins: client.metadata.sourceOrigins,
      redirectUri: query.get("redirect_uri") ?? "",
      resource: automationResource,
      approvedScopes,
      recentlyAuthenticated,
      identityConfirmationRequired: actor.sessionContextChanged === true,
      permissionsRevision: client.metadata.permissionsRevision ?? "initial",
    };
  }

  /** A human may review their registered actions even when the app requested less.
   * Start a fresh provider-owned consent flow; never enlarge an existing grant.
   */
  async reviewPermissions(
    actor: TrustedActor,
    headers: Headers,
    input: unknown,
  ) {
    const parsed = oauthReviewInput.parse(input);
    await this.limiter.consume("oauth-consent-review", actor.userId, 20);
    const details = await this.details(actor, headers, parsed.oauth_query);
    if (parsed.expectedRevision !== details.permissionsRevision)
      throw new DomainError(
        "OAUTH_PERMISSIONS_CHANGED",
        "This connection's permissions changed. Reload and review them before continuing.",
        409,
      );
    await this.checkScopes(actor, details.allowedScopes);
    const verified = await auth.api.readAutomationOAuthRequest({
      headers,
      body: { oauth_query: parsed.oauth_query },
    });
    // Provider handoffs can repeat internal continuation parameters. Carry only
    // protocol bindings into a new authorization, never its signed handoff state.
    const original = new URLSearchParams(verified.query);
    const query = new URLSearchParams();
    for (const key of [
      "response_type",
      "client_id",
      "redirect_uri",
      "resource",
      "state",
      "code_challenge",
      "code_challenge_method",
      "nonce",
      "login_hint",
      "max_age",
      "response_mode",
    ]) {
      const value = original.get(key);
      if (value !== null) query.set(key, value);
    }
    query.set("scope", details.allowedScopes.join(" "));
    query.set("prompt", "consent");
    const url = new URL("/api/auth/oauth2/authorize", config.APP_URL);
    url.search = query.toString();
    return { url: url.href };
  }

  async consent(actor: TrustedActor, headers: Headers, input: unknown) {
    const parsed = oauthConsentInput.parse(input);
    await this.limiter.consume("oauth-consent", actor.userId, 20);
    return withOAuthGrantLock(this.db, async (tx) => {
      const details = await this.details(actor, headers, parsed.oauth_query);
      if (parsed.expectedRevision !== details.permissionsRevision)
        throw new DomainError(
          "OAUTH_PERMISSIONS_CHANGED",
          "This connection's permissions changed. Reload and review them before approving.",
          409,
        );
      if (
        parsed.scopes.some((scope) => !details.scopes.includes(scope)) ||
        (parsed.accept &&
          !parsed.scopes.some((scope) => scope !== "offline_access"))
      )
        throw new DomainError(
          "OAUTH_SCOPE_INVALID",
          "Select at least one requested action, or cancel this connection.",
          422,
        );
      const consent = await this.currentConsent(actor, details.clientId, tx);
      const approved = consent?.resources?.includes(automationResource)
        ? consent.scopes
        : [];
      // Reusing or reducing an existing grant is routine. Re-read after locking:
      // a different tab may have narrowed consent since the details were loaded.
      if (
        parsed.accept &&
        (actor.sessionContextChanged ||
          parsed.scopes.some((scope) => !approved.includes(scope)))
      )
        this.authorization.requireRecent(actor);
      const result = await auth.api.oauth2Consent({
        headers,
        request: new Request(
          new URL("/api/auth/oauth2/consent", config.APP_URL),
          { method: "POST", headers },
        ),
        body: {
          accept: parsed.accept,
          scope: parsed.scopes.join(" "),
          oauth_query: parsed.oauth_query,
        },
      });
      const redirect = z
        .object({ url: z.url() })
        .parse(result instanceof Response ? await result.json() : result);
      const callback = new URL(redirect.url);
      const expected = new URL(details.redirectUri);
      if (
        callback.origin !== expected.origin ||
        callback.pathname !== expected.pathname
      )
        throw new DomainError(
          "OAUTH_CALLBACK_INVALID",
          "Start the connection again from your AI client.",
          409,
        );
      const access = await this.authorization.require(
        actor,
        "integrations.manage",
        tx,
      );
      await this.audit(
        actor,
        access.organizationId,
        parsed.accept
          ? "automation.oauth.authorized"
          : "automation.oauth.denied",
        details.clientId,
        tx,
      );
      return { url: redirect.url };
    });
  }

  async authorizedClient(
    actor: TrustedActor,
    clientId: string,
    scopes: string[],
    issuedAt: number,
  ) {
    const client = await this.ownedClient(actor, clientId);
    const consent = await this.currentConsent(actor, clientId);
    if (
      !consent ||
      !consent.resources?.includes(automationResource) ||
      issuedAt * 1000 < consent.updatedAt.getTime() ||
      scopes.some(
        (scope) =>
          !consent.scopes.includes(scope) ||
          !client.record.scopes?.includes(scope),
      )
    )
      throw new DomainError(
        "OAUTH_GRANT_EXPIRED",
        "Reconnect your AI client and review its access again.",
        401,
      );
    return client.metadata;
  }

  private async currentConsent(
    actor: TrustedActor,
    clientId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [consent] = await executor
      .select()
      .from(oauthConsent)
      .where(
        and(
          eq(oauthConsent.clientId, clientId),
          eq(oauthConsent.userId, actor.userId),
        ),
      )
      .orderBy(desc(oauthConsent.updatedAt))
      .limit(1);
    return consent;
  }

  private async ownedClient(actor: TrustedActor, clientId: string) {
    const access = await this.authorization.require(
      actor,
      "integrations.manage",
    );
    const [record] = await this.db
      .select()
      .from(oauthClient)
      .where(
        and(
          eq(oauthClient.clientId, z.string().min(1).max(200).parse(clientId)),
          eq(oauthClient.userId, actor.userId),
        ),
      )
      .limit(1);
    const metadata = oauthClientMetadata.safeParse(record?.metadata);
    if (
      !record ||
      record.disabled ||
      !metadata.success ||
      metadata.data.organizationId !== access.organizationId
    )
      throw new DomainError(
        "OAUTH_CLIENT_UNAVAILABLE",
        "This OAuth connection is unavailable for your current account.",
        403,
      );
    return { record, metadata: metadata.data };
  }

  private async checkScopes(actor: TrustedActor, scopes: string[]) {
    for (const scope of scopes) {
      if (scope === "offline_access") continue;
      const parsed = automationScopeSchema.parse(scope);
      await this.authorization.require(
        actor,
        scopeDefinitions[parsed].capability,
      );
    }
  }

  private audit(
    actor: TrustedActor,
    organizationId: string,
    action: string,
    targetId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    return new AuditRepository().record(executor, {
      organizationId,
      actorUserId: actor.userId,
      action,
      targetId,
    });
  }
}
