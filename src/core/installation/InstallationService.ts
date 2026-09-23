import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { installation, membership, organization } from "../../../db/schema/club";
import type { Database } from "../../infrastructure/database/client";
import { AuditRepository } from "../audit/AuditRepository";
import {
  DomainError,
  requireRecentActor,
  requireVerifiedActor,
  type TrustedActor,
} from "../authorization/AuthorizationService";
import { organizationIdentitySchema, type PublicOrganization } from "../organization/organization_schemas";

const installationInput = organizationIdentitySchema.extend({ claim: z.string().min(32).max(256) });

function matchesClaim(raw: string, digest: string | null): boolean {
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) return false;
  const submitted = createHash("sha256").update(raw).digest();
  return timingSafeEqual(submitted, Buffer.from(digest, "hex"));
}

export class InstallationService {
  private readonly audit = new AuditRepository();

  constructor(private readonly db: Database) {}

  async isComplete(): Promise<boolean> {
    const [state] = await this.db.select({ completedAt: installation.completedAt }).from(installation)
      .where(eq(installation.id, 1));
    return Boolean(state?.completedAt);
  }

  async complete(actor: TrustedActor, input: unknown): Promise<PublicOrganization> {
    requireVerifiedActor(actor);
    requireRecentActor(actor);
    const { claim, ...identity } = installationInput.parse(input);
    return this.db.transaction(async (tx) => {
      // The singleton lock covers verification and every installation write. A second
      // contender sees the consumed claim only after the winner commits.
      const [state] = await tx.select().from(installation).where(eq(installation.id, 1)).for("update");
      if (!state || state.completedAt || !state.claimExpiresAt
        || state.claimExpiresAt.getTime() <= Date.now()
        || state.nominatedEmail.toLowerCase() !== actor.email.trim().toLowerCase()
        || !matchesClaim(claim, state.claimHash)) {
        throw new DomainError("SETUP_CLAIM_INVALID", "The setup claim is unavailable, expired, or not assigned to this verified identity.", 409);
      }
      const [created] = await tx.insert(organization).values(identity).returning({ id: organization.id });
      if (!created) throw new Error("Organization insert did not return an identifier.");
      await tx.insert(membership).values({
        organizationId: created.id,
        userId: actor.userId,
        role: "owner",
        status: "approved",
      });
      await tx.update(installation).set({
        organizationId: created.id,
        completedAt: new Date(),
        claimHash: null,
        claimExpiresAt: null,
      }).where(eq(installation.id, 1));
      await this.audit.record(tx, {
        organizationId: created.id,
        actorUserId: actor.userId,
        action: "installation.completed",
        targetId: created.id,
      });
      return identity;
    });
  }
}
