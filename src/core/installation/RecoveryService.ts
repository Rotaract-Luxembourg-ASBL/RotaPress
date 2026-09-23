import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { membership, organization, ownerRecovery } from "../../../db/schema/club";
import type { Database } from "../../infrastructure/database/client";
import { AuditRepository } from "../audit/AuditRepository";
import {
  DomainError,
  requireRecentActor,
  requireVerifiedActor,
  type TrustedActor,
} from "../authorization/AuthorizationService";

const recoveryInput = z.object({ claim: z.string().min(32).max(256) }).strict();

/** Recovery claims can only be issued by the separate privileged local command. */
export class RecoveryService {
  private readonly audit = new AuditRepository();

  constructor(private readonly db: Database) {}

  async complete(actor: TrustedActor, input: unknown): Promise<void> {
    requireVerifiedActor(actor);
    requireRecentActor(actor);
    const { claim } = recoveryInput.parse(input);
    const digest = createHash("sha256").update(claim).digest("hex");
    await this.db.transaction(async (tx) => {
      const [candidate] = await tx.select({ id: ownerRecovery.id, organizationId: ownerRecovery.organizationId })
        .from(ownerRecovery).where(eq(ownerRecovery.claimHash, digest)).limit(1);
      if (!candidate) this.reject();
      // Match the membership/settings lock order. A competing permission change
      // commits before we evaluate whether this person is still an active owner.
      await tx.select({ id: organization.id }).from(organization)
        .where(eq(organization.id, candidate.organizationId)).for("update");
      const [recovery] = await tx.select().from(ownerRecovery)
        .where(eq(ownerRecovery.id, candidate.id)).for("update");
      const [currentMembership] = await tx.select({ role: membership.role, status: membership.status })
        .from(membership).where(and(
          eq(membership.organizationId, candidate.organizationId), eq(membership.userId, actor.userId),
        ));
      if (!recovery || recovery.usedAt || recovery.expiresAt.getTime() <= Date.now()
        || recovery.userId !== actor.userId
        || recovery.nominatedEmail.toLowerCase() !== actor.email.trim().toLowerCase()
        || currentMembership?.status !== "approved" || currentMembership.role !== "owner") {
        this.reject();
      }
      await tx.update(organization).set({ staffAuthPolicy: "email-or-google", updatedAt: new Date() })
        .where(eq(organization.id, candidate.organizationId));
      await tx.update(ownerRecovery).set({ usedAt: new Date() }).where(eq(ownerRecovery.id, candidate.id));
      await this.audit.record(tx, {
        organizationId: candidate.organizationId,
        actorUserId: actor.userId,
        action: "owner.recovery.completed",
        targetId: candidate.id,
      });
    });
  }

  private reject(): never {
    throw new DomainError("RECOVERY_CLAIM_INVALID", "The recovery claim is unavailable, expired, or not assigned to this verified owner.", 409);
  }
}
