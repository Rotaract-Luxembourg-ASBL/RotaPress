import "server-only";
import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { user } from "../../../db/schema/auth";
import {
  installation,
  membership,
  type MembershipRole,
  type MembershipStatus,
} from "../../../db/schema/club";
import type { Database } from "../../infrastructure/database/client";
import type { DatabaseExecutor } from "../../core/authorization/AuthorizationService";
import type { MembershipQuery } from "./membership_schemas";

export class MembershipRepository {
  constructor(private readonly db: Database) {}

  async installedOrganization(executor: DatabaseExecutor = this.db) {
    const [state] = await executor
      .select({ id: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    return state?.id ?? null;
  }

  async own(
    userId: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [own] = await executor
      .select({
        id: membership.id,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt,
      })
      .from(membership)
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.organizationId, organizationId),
        ),
      );
    return own ?? null;
  }

  async target(id: string, organizationId: string, executor: DatabaseExecutor) {
    const [target] = await executor
      .select({
        id: membership.id,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        version: membership.version,
      })
      .from(membership)
      .where(
        and(
          eq(membership.id, id),
          eq(membership.organizationId, organizationId),
        ),
      );
    return target;
  }

  async approvedOwners(organizationId: string, executor: DatabaseExecutor) {
    return executor
      .select({ id: membership.id })
      .from(membership)
      .where(
        and(
          eq(membership.organizationId, organizationId),
          eq(membership.role, "owner"),
          eq(membership.status, "approved"),
        ),
      );
  }

  async change(
    id: string,
    organizationId: string,
    values: { role: MembershipRole; status: MembershipStatus },
    executor: DatabaseExecutor,
  ) {
    await executor
      .update(membership)
      .set({
        ...values,
        version: sql`${membership.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(membership.id, id),
          eq(membership.organizationId, organizationId),
        ),
      );
  }

  async apply(
    userId: string,
    organizationId: string,
    executor: DatabaseExecutor,
  ) {
    await executor
      .insert(membership)
      .values({ userId, organizationId, role: "member", status: "pending" })
      .onConflictDoNothing({
        target: [membership.organizationId, membership.userId],
      });
  }

  async query(organizationId: string, input: MembershipQuery) {
    const pattern = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
    const where = and(
      eq(membership.organizationId, organizationId),
      input.status === "all" ? undefined : eq(membership.status, input.status),
      input.role === "all" ? undefined : eq(membership.role, input.role),
      input.search
        ? or(ilike(user.name, pattern), ilike(user.email, pattern))
        : undefined,
    );
    return this.db.transaction(
      async (tx) => {
        const [matched] = await tx
          .select({ total: count() })
          .from(membership)
          .innerJoin(user, eq(user.id, membership.userId))
          .where(where);
        const grouped = await tx
          .select({ status: membership.status, total: count() })
          .from(membership)
          .where(eq(membership.organizationId, organizationId))
          .groupBy(membership.status);
        const counts = {
          all: 0,
          pending: 0,
          approved: 0,
          suspended: 0,
          rejected: 0,
          former: 0,
        };
        for (const row of grouped) {
          counts[row.status] = row.total;
          counts.all += row.total;
        }
        const [owners] = await tx
          .select({ total: count() })
          .from(membership)
          .where(
            and(
              eq(membership.organizationId, organizationId),
              eq(membership.status, "approved"),
              eq(membership.role, "owner"),
            ),
          );
        const page = Math.min(
          input.page,
          Math.max(1, Math.ceil(matched.total / input.pageSize)),
        );
        const members = await tx
          .select({
            id: membership.id,
            name: user.name,
            email: user.email,
            role: membership.role,
            status: membership.status,
            version: membership.version,
            createdAt: membership.createdAt,
          })
          .from(membership)
          .innerJoin(user, eq(user.id, membership.userId))
          .where(where)
          .orderBy(asc(user.name), asc(membership.id))
          .limit(input.pageSize)
          .offset((page - 1) * input.pageSize);
        return {
          members,
          total: matched.total,
          page,
          pageSize: input.pageSize,
          counts,
          approvedOwners: owners.total,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
