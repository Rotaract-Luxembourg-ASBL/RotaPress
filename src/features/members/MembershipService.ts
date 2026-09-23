import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { membershipRoles, membershipStatuses, organization } from "../../../db/schema/club";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  requireVerifiedActor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import { FormService } from "../forms/FormService";
import { MembershipRepository } from "./MembershipRepository";

const changeInput = z.object({
  membershipId: z.uuid(),
  status: z.enum(membershipStatuses),
  role: z.enum(membershipRoles),
}).strict();

export class MembershipService {
  private readonly repository: MembershipRepository;
  private readonly audit = new AuditRepository();

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly forms = new FormService(db, authorization),
  ) {
    this.repository = new MembershipRepository(db);
  }

  async own(actor: TrustedActor) {
    requireVerifiedActor(actor);
    const organizationId = await this.repository.installedOrganization();
    return organizationId ? this.repository.own(actor.userId, organizationId) : null;
  }

  async apply(actor: TrustedActor) {
    requireVerifiedActor(actor);
    return this.db.transaction(async (tx) => {
      const organizationId = await this.lockOrganization(tx);
      await this.forms.assertDirectMembershipApplicationAllowed(organizationId, tx);
      return this.applyLocked(actor, organizationId, tx);
    });
  }

  /** Reuse the same approval boundary atomically with a membership form submission. */
  async applyInTransaction(actor: TrustedActor, tx: Transaction) {
    requireVerifiedActor(actor);
    return this.applyLocked(actor, await this.lockOrganization(tx), tx);
  }

  private async lockOrganization(tx: Transaction): Promise<string> {
    const organizationId = await this.repository.installedOrganization(tx);
    if (!organizationId) throw new DomainError("SETUP_REQUIRED", "The club has not completed setup.", 409);
    // Share the organization lock with staff decisions, so reapplication cannot
    // race a suspension or recover an old staff role.
    await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId)).for("update");
    return organizationId;
  }

  private async applyLocked(actor: TrustedActor, organizationId: string, tx: Transaction) {
    const current = await this.repository.own(actor.userId, organizationId, tx);
    if (current?.status === "suspended") {
      throw new DomainError("MEMBERSHIP_SUSPENDED", "Contact the club about your suspended membership.");
    }
    if (current?.status === "approved" || current?.status === "pending") return current;
    if (current) {
      await this.repository.change(current.id, organizationId, { role: "member", status: "pending" }, tx);
    } else {
      await this.repository.apply(actor.userId, organizationId, tx);
    }
    await this.audit.record(tx, { organizationId, actorUserId: actor.userId, action: "membership.applied" });
    return this.repository.own(actor.userId, organizationId, tx);
  }

  async list(actor: TrustedActor) {
    const scope = await this.authorization.require(actor, "members.review");
    return this.repository.list(scope.organizationId);
  }

  async change(actor: TrustedActor, input: unknown): Promise<void> {
    const values = changeInput.parse(input);
    this.authorization.requireRecent(actor);
    await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(actor, "members.manage", tx);
      const target = await this.repository.target(values.membershipId, scope.organizationId, tx);
      if (!target) throw new DomainError("MEMBERSHIP_NOT_FOUND", "This membership is unavailable.", 404);
      if (target.role === "owner" || values.role === "owner") {
        await this.authorization.require(actor, "ownership.manage", tx);
      }
      if (target.userId === actor.userId && scope.role !== "owner") {
        throw new DomainError("SELF_PERMISSION_CHANGE", "Another authorized owner must change your own staff permissions.");
      }
      if (values.status === "pending" && values.role !== "member") {
        throw new DomainError("PENDING_ROLE_INVALID", "Pending applications cannot hold staff roles.", 422);
      }
      if (target.role === "owner" && target.status === "approved"
        && (values.role !== "owner" || values.status !== "approved")) {
        const owners = await this.repository.approvedOwners(scope.organizationId, tx);
        if (owners.length <= 1) {
          throw new DomainError("LAST_OWNER", "The club must retain at least one approved owner.", 409);
        }
      }
      await this.repository.change(target.id, scope.organizationId, { role: values.role, status: values.status }, tx);
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "membership.permissions_updated",
        targetId: target.id,
      });
    });
  }
}
