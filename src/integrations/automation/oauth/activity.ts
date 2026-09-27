import "server-only";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { auditEntry } from "../../../../db/schema/club";
import { oauthConsent } from "../../../../db/schema/oauth";
import type { Database } from "@/infrastructure/database/client";
import { automationResource } from "@/core/auth/automation_oauth";

export async function connectionHistory(
  db: Database,
  organizationId: string,
  userId: string,
  ids: string[],
) {
  if (!ids.length) return { latest: [], consents: [] };
  const [latest, consents] = await Promise.all([
    db
      .select({ targetId: auditEntry.targetId, at: max(auditEntry.createdAt) })
      .from(auditEntry)
      .where(
        and(
          eq(auditEntry.organizationId, organizationId),
          eq(auditEntry.actorUserId, userId),
          inArray(
            auditEntry.targetId,
            ids.flatMap((id) => [id, `oauth:${id}`]),
          ),
        ),
      )
      .groupBy(auditEntry.targetId),
    db
      .select({
        clientId: oauthConsent.clientId,
        scopes: oauthConsent.scopes,
        resources: oauthConsent.resources,
        at: oauthConsent.updatedAt,
      })
      .from(oauthConsent)
      .where(
        and(
          eq(oauthConsent.userId, userId),
          inArray(oauthConsent.clientId, ids),
        ),
      )
      .orderBy(desc(oauthConsent.updatedAt)),
  ]);
  return {
    latest,
    consents: consents.filter((item) =>
      item.resources?.includes(automationResource),
    ),
  };
}

export async function recentConnectionActivity(
  db: Database,
  organizationId: string,
  userId: string,
  clientId: string,
) {
  const entries = await db
    .select({
      id: auditEntry.id,
      action: auditEntry.action,
      at: auditEntry.createdAt,
    })
    .from(auditEntry)
    .where(
      and(
        eq(auditEntry.organizationId, organizationId),
        eq(auditEntry.actorUserId, userId),
        inArray(auditEntry.targetId, [clientId, `oauth:${clientId}`]),
      ),
    )
    .orderBy(desc(auditEntry.createdAt), desc(auditEntry.id))
    .limit(30);
  return entries.map((entry) => ({ ...entry, at: entry.at.toISOString() }));
}
