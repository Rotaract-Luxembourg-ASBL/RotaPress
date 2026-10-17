import "server-only";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { oauthClient } from "../../../../db/schema/oauth";
import type {
  AuthorizationService,
  TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { DomainError } from "@/core/DomainError";
import type { Database } from "@/infrastructure/database/client";
import { automationScopeSchema, type AutomationScope } from "../scopes";
import { connectionHistory } from "./activity";
import { oauthClientMetadata } from "./policy";
import {
  oauthCollectionInput,
  type OAuthConnectionCollection,
} from "./connection_collection";

/** Page owned registrations without truncating older revoked connections. */
export async function listOAuthConnections(
  db: Database,
  authorization: AuthorizationService,
  actor: TrustedActor,
  input: unknown,
): Promise<OAuthConnectionCollection> {
  const query = oauthCollectionInput.parse(input);
  return db.transaction(
    async (tx) => {
      const access = await authorization.require(
        actor,
        "integrations.manage",
        tx,
      );
      // Better Auth has persisted both JSON objects and JSON-encoded strings.
      // Invalid legacy strings must not make casts fail or enter another scope.
      const metadata = sql`(case when jsonb_typeof(${oauthClient.metadata}) = 'string'
      then case when pg_input_is_valid(${oauthClient.metadata} #>> '{}', 'jsonb')
        then (${oauthClient.metadata} #>> '{}')::jsonb else null end
      else ${oauthClient.metadata} end)`;
      const search = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
      const filter = and(
        eq(oauthClient.userId, actor.userId),
        sql`${metadata}->>'purpose' = 'rotapress-oauth-v1'`,
        sql`${metadata}->>'organizationId' = ${access.organizationId}`,
        query.search
          ? or(
              ilike(oauthClient.name, search),
              ilike(oauthClient.clientId, search),
              ilike(
                sql`array_to_string(${oauthClient.redirectUris}, ' ')`,
                search,
              ),
            )
          : undefined,
      );
      const [matched] = await tx
        .select({ total: count() })
        .from(oauthClient)
        .where(filter);
      const page = Math.min(
        query.page,
        Math.max(1, Math.ceil(matched.total / query.pageSize)),
      );
      const rows = await tx
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
        .where(filter)
        .orderBy(
          sql`${oauthClient.createdAt} desc nulls last`,
          desc(oauthClient.clientId),
        )
        .limit(query.pageSize)
        .offset((page - 1) * query.pageSize);
      const history = await connectionHistory(
        tx,
        access.organizationId,
        actor.userId,
        rows.map((client) => client.clientId),
      );
      const clients = rows.map((client) => {
        const parsed = oauthClientMetadata.safeParse(client.metadata);
        if (
          !parsed.success ||
          parsed.data.organizationId !== access.organizationId
        )
          throw new DomainError(
            "OAUTH_CONNECTION_METADATA_INVALID",
            "A connection has invalid saved settings. Ask the installation owner to review its configuration.",
            409,
          );
        const consent = history.consents.find(
          (item) => item.clientId === client.clientId,
        );
        const used = history.latest.find(
          (item) => item.targetId === `oauth:${client.clientId}`,
        );
        return {
          clientId: client.clientId,
          name: client.name,
          disabled: Boolean(client.disabled),
          redirectUris: client.redirectUris,
          scopes: (client.scopes ?? []).filter(
            (scope): scope is AutomationScope =>
              automationScopeSchema.safeParse(scope).success,
          ),
          sourceOrigins: parsed.data.sourceOrigins,
          createdAt: client.createdAt?.toISOString() ?? null,
          authentication: client.authentication,
          permissionsRevision: parsed.data.permissionsRevision ?? "initial",
          approvedScopes: (consent?.scopes ?? []).filter(
            (scope): scope is AutomationScope =>
              automationScopeSchema.safeParse(scope).success,
          ),
          consentedAt: consent?.at?.toISOString() ?? null,
          lastUsedAt:
            used?.at instanceof Date
              ? used.at.toISOString()
              : (used?.at ?? null),
        };
      });
      return { clients, total: matched.total, page, pageSize: query.pageSize };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
