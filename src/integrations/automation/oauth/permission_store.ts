import "server-only";
import { randomUUID } from "node:crypto";
import { auth } from "@/core/auth/server";
import type { z } from "zod";
import type { oauthClientMetadata } from "./policy";
import type { Transaction } from "@/core/authorization/AuthorizationService";
import { oauthAuthorizationCodeIds } from "./authorization_codes";

/** Called only after current ownership, capability and revision checks under the
 * connection lock. Use Better Auth's transactional adapter for its grant records;
 * credential creation, token hashing and issuance remain provider-owned. */
export async function replaceOAuthPermissions(
  clientId: string,
  scopes: string[],
  metadata: z.output<typeof oauthClientMetadata>,
  executor: Transaction,
) {
  const revision = randomUUID();
  const now = new Date();
  const codeIds = await oauthAuthorizationCodeIds(executor, clientId);
  const { adapter } = await auth.$context;
  await adapter.transaction(async (tx) => {
    const where = [{ field: "clientId", value: clientId }];
    await tx.update({
      model: "oauthClient",
      where,
      update: {
        scopes: [...new Set([...scopes, "offline_access"])],
        metadata: { ...metadata, permissionsRevision: revision },
        updatedAt: now,
      },
    });
    await tx.updateMany({
      model: "oauthAccessToken",
      where,
      update: { revoked: now },
    });
    await tx.updateMany({
      model: "oauthRefreshToken",
      where,
      update: {
        revoked: now,
        rotationReplayResponse: null,
        rotationReplayExpiresAt: null,
      },
    });
    await tx.deleteMany({ model: "oauthConsent", where });
    // Codes must commit with grant invalidation: a later audit rollback must not
    // leave an old code redeemable after this client approves fresh consent.
    if (codeIds.length)
      await tx.deleteMany({
        model: "verification",
        where: [{ field: "id", operator: "in", value: codeIds }],
      });
  });
  return revision;
}
