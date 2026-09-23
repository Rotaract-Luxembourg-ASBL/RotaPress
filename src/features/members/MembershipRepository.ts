import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { user } from "../../../db/schema/auth";
import { installation, membership, type MembershipRole, type MembershipStatus } from "../../../db/schema/club";
import type { Database } from "../../infrastructure/database/client";
import type { DatabaseExecutor } from "../../core/authorization/AuthorizationService";

export class MembershipRepository {
  constructor(private readonly db: Database) {}

  async installedOrganization(executor: DatabaseExecutor = this.db) {
    const [state] = await executor.select({ id: installation.organizationId }).from(installation)
      .where(eq(installation.id, 1));
    return state?.id ?? null;
  }

  async own(userId: string, organizationId: string, executor: DatabaseExecutor = this.db) {
    const [own] = await executor.select({
      id: membership.id, role: membership.role, status: membership.status, createdAt: membership.createdAt,
    }).from(membership).where(and(eq(membership.userId, userId), eq(membership.organizationId, organizationId)));
    return own ?? null;
  }

  async list(organizationId: string) {
    return this.db.select({
      id: membership.id,
      name: user.name,
      email: user.email,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt,
    }).from(membership).innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.organizationId, organizationId)).orderBy(asc(membership.createdAt)).limit(500);
  }

  async target(id: string, organizationId: string, executor: DatabaseExecutor) {
    const [target] = await executor.select({
      id: membership.id, userId: membership.userId, role: membership.role, status: membership.status,
    }).from(membership).where(and(eq(membership.id, id), eq(membership.organizationId, organizationId)));
    return target;
  }

  async approvedOwners(organizationId: string, executor: DatabaseExecutor) {
    return executor.select({ id: membership.id }).from(membership).where(and(
      eq(membership.organizationId, organizationId), eq(membership.role, "owner"), eq(membership.status, "approved"),
    ));
  }

  async change(id: string, organizationId: string, values: { role: MembershipRole; status: MembershipStatus }, executor: DatabaseExecutor) {
    await executor.update(membership).set({ ...values, updatedAt: new Date() })
      .where(and(eq(membership.id, id), eq(membership.organizationId, organizationId)));
  }

  async apply(userId: string, organizationId: string, executor: DatabaseExecutor) {
    await executor.insert(membership).values({ userId, organizationId, role: "member", status: "pending" })
      .onConflictDoNothing({ target: [membership.organizationId, membership.userId] });
  }
}
