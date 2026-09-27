import "server-only";
import { randomUUID } from "node:crypto";
import { auth } from "@/core/auth/server";
import type { z } from "zod";
import type { oauthClientMetadata } from "./policy";

/** Called only after current ownership, capability and revision checks under the
 * connection lock. Use Better Auth's transactional adapter for its grant records;
 * credential creation, token hashing and issuance remain provider-owned. */
export async function replaceOAuthPermissions(
  clientId: string,
  scopes: string[],
  metadata: z.output<typeof oauthClientMetadata>,
) {
  const revision = randomUUID();
  const now = new Date();
  const { adapter } = await auth.$context;
  await adapter.transaction(async (tx) => {
    const where = [{ field: "clientId", value: clientId }];
    await tx.update({
      model: "oauthClient",
      where,
      update: {
        scopes: [...new Set(scopes), "offline_access"],
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
  });
  return revision;
}
