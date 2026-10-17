import "server-only";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { apikey } from "../../../db/schema/auth";
import type {
  AuthorizationService,
  TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { DomainError } from "@/core/DomainError";
import { collectionPage, searchPattern } from "@/core/collections";
import type { Database } from "@/infrastructure/database/client";
import { automationScopeSchema, connectionMetadata } from "./scopes";
import { tokenCollectionInput, type TokenCollection } from "./token_collection";

/** Read only public-to-owner metadata; Better Auth still creates/revokes keys. */
export async function listAutomationConnections(
  db: Database,
  authorization: AuthorizationService,
  actor: TrustedActor,
  input: unknown,
): Promise<TokenCollection> {
  const query = tokenCollectionInput.parse(input);
  return db.transaction(
    async (tx) => {
      const access = await authorization.require(
        actor,
        "integrations.manage",
        tx,
      );
      const metadata = sql`(case when pg_input_is_valid(${apikey.metadata}, 'jsonb')
      then ${apikey.metadata}::jsonb else null end)`;
      const filter = and(
        eq(apikey.referenceId, actor.userId),
        eq(apikey.configId, "default"),
        sql`${metadata}->>'purpose' = 'rotapress-automation-v1'`,
        sql`${metadata}->>'organizationId' = ${access.organizationId}`,
        query.transport
          ? sql`coalesce(${metadata}->>'transport', 'rest') = ${query.transport}`
          : undefined,
        query.search
          ? or(
              ilike(apikey.name, searchPattern(query.search)),
              ilike(apikey.id, searchPattern(query.search)),
            )
          : undefined,
      );
      const [matched] = await tx
        .select({ total: count() })
        .from(apikey)
        .where(filter);
      const page = collectionPage(matched.total, query.page, query.pageSize);
      const rows = await tx
        .select({
          id: apikey.id,
          name: apikey.name,
          expiresAt: apikey.expiresAt,
          enabled: apikey.enabled,
          metadata: apikey.metadata,
          permissions: apikey.permissions,
        })
        .from(apikey)
        .where(filter)
        .orderBy(desc(apikey.createdAt), desc(apikey.id))
        .limit(query.pageSize)
        .offset((page - 1) * query.pageSize);
      const connections = rows.map((row) => {
        let rawMetadata: unknown, rawPermissions: unknown;
        try {
          rawMetadata = JSON.parse(row.metadata ?? "null") as unknown;
          rawPermissions = JSON.parse(row.permissions ?? "null") as unknown;
        } catch {
          throw invalidSettings();
        }
        const saved = connectionMetadata.safeParse(rawMetadata);
        const permissions = z
          .object({ automation: z.array(automationScopeSchema) })
          .safeParse(rawPermissions);
        if (
          !saved.success ||
          !permissions.success ||
          saved.data.organizationId !== access.organizationId
        )
          throw invalidSettings();
        return {
          id: row.id,
          name: row.name,
          transport: saved.data.transport,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          expired:
            row.expiresAt !== null && row.expiresAt.getTime() <= Date.now(),
          enabled: Boolean(row.enabled),
          scopes: permissions.data.automation,
          sourceOrigins: saved.data.sourceOrigins,
          currentSession: saved.data.sessionId === actor.sessionId,
        };
      });
      return {
        connections,
        total: matched.total,
        page,
        pageSize: query.pageSize,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

function invalidSettings() {
  return new DomainError(
    "AUTOMATION_CONNECTION_METADATA_INVALID",
    "A credential has invalid saved settings. Ask the installation owner to review its configuration.",
    409,
  );
}
