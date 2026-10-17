import "server-only";
import { eq } from "drizzle-orm";
import { organization } from "../../../db/schema/club";
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
import {
  membershipChangeSchema,
  membershipDecisionSchema,
  membershipQuerySchema,
  membershipRoleSchema,
} from "./membership_schemas";

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
    return organizationId
      ? this.repository.own(actor.userId, organizationId)
      : null;
  }

  async apply(actor: TrustedActor) {
    requireVerifiedActor(actor);
    return this.db.transaction(async (tx) => {
      const organizationId = await this.lockOrganization(tx);
      await this.forms.assertDirectMembershipApplicationAllowed(
        organizationId,
        tx,
      );
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
    if (!organizationId)
      throw new DomainError(
        "SETUP_REQUIRED",
        "The club has not completed setup.",
        409,
      );
    // Share the organization lock with staff decisions, so reapplication cannot
    // race a suspension or recover an old staff role.
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .for("update");
    return organizationId;
  }

  private async applyLocked(
    actor: TrustedActor,
    organizationId: string,
    tx: Transaction,
  ) {
    const current = await this.repository.own(actor.userId, organizationId, tx);
    if (current?.status === "suspended") {
      throw new DomainError(
        "MEMBERSHIP_SUSPENDED",
        "Contact the club about your suspended membership.",
      );
    }
    if (current?.status === "approved" || current?.status === "pending")
      return current;
    if (current) {
      await this.repository.change(
        current.id,
        organizationId,
        { role: "member", status: "pending" },
        tx,
      );
    } else {
      await this.repository.apply(actor.userId, organizationId, tx);
    }
    await this.audit.record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action: "membership.applied",
    });
    return this.repository.own(actor.userId, organizationId, tx);
  }

  async change(actor: TrustedActor, input: unknown): Promise<void> {
    await this.changeWith(actor, membershipChangeSchema.parse(input));
  }

  async query(actor: TrustedActor, input: unknown) {
    const scope = await this.authorization.require(actor, "members.review");
    return this.repository.query(
      scope.organizationId,
      membershipQuerySchema.parse(input),
    );
  }

  async decide(actor: TrustedActor, input: unknown, tx?: Transaction) {
    return this.changeWith(actor, membershipDecisionSchema.parse(input), tx);
  }

  async changeRole(actor: TrustedActor, input: unknown, tx?: Transaction) {
    return this.changeWith(actor, membershipRoleSchema.parse(input), tx);
  }

  private async changeWith(
    actor: TrustedActor,
    values: {
      membershipId: string;
      expectedVersion: number;
      status?: "pending" | "approved" | "suspended" | "rejected" | "former";
      role?: "owner" | "administrator" | "editor" | "member";
    },
    executor?: Transaction,
  ) {
    this.authorization.requireRecent(actor);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "members.manage", tx);
      const target = await this.repository.target(
        values.membershipId,
        scope.organizationId,
        tx,
      );
      if (!target)
        throw new DomainError(
          "MEMBERSHIP_NOT_FOUND",
          "This membership is unavailable.",
          404,
        );
      if (target.version !== values.expectedVersion)
        throw new DomainError(
          "MEMBERSHIP_CHANGED",
          "This membership changed. Reload its current access before trying again.",
          409,
        );
      const status = values.status ?? target.status;
      const role = values.role ?? target.role;
      if (target.role === "owner" || role === "owner") {
        await this.authorization.require(actor, "ownership.manage", tx);
      }
      if (target.userId === actor.userId && scope.role !== "owner") {
        throw new DomainError(
          "SELF_PERMISSION_CHANGE",
          "Another authorized owner must change your own staff permissions.",
        );
      }
      if (status === "pending" && role !== "member") {
        throw new DomainError(
          "PENDING_ROLE_INVALID",
          "Pending applications cannot hold staff roles.",
          422,
        );
      }
      if (
        target.role === "owner" &&
        target.status === "approved" &&
        (role !== "owner" || status !== "approved")
      ) {
        const owners = await this.repository.approvedOwners(
          scope.organizationId,
          tx,
        );
        if (owners.length <= 1) {
          throw new DomainError(
            "LAST_OWNER",
            "The club must retain at least one approved owner.",
            409,
          );
        }
      }
      await this.repository.change(
        target.id,
        scope.organizationId,
        { role, status },
        tx,
      );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "membership.permissions_updated",
        targetId: target.id,
      });
      return { id: target.id, status, role, version: target.version + 1 };
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }
}
