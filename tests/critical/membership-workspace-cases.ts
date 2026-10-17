import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { user } from "../../db/schema/auth";
import { membership } from "../../db/schema/club";
import type { TrustedActor } from "../../src/core/authorization/AuthorizationService";
import type { Database } from "../../src/infrastructure/database/client";
import type { MembershipService } from "../../src/features/members/MembershipService";

export function membershipWorkspaceChecks(
  setup: () => Promise<{
    db: Database;
    members: MembershipService;
    owner: TrustedActor;
    organizationId: string;
  }>,
) {
  it("paginates all memberships with scoped totals and rejects stale decisions and role changes", async () => {
    const { db, members, owner, organizationId } = await setup();
    const identities = Array.from({ length: 505 }, (_, index) => ({
      id: randomUUID(),
      name: `Applicant ${String(index).padStart(3, "0")}`,
      email: `applicant-${index}@example.test`,
      emailVerified: true,
    }));
    await db.insert(user).values(identities);
    await db.insert(membership).values(
      identities.map((actor) => ({
        organizationId,
        userId: actor.id,
        role: "member" as const,
        status: "pending" as const,
      })),
    );
    const first = await members.query(owner, {
      status: "pending",
      pageSize: 100,
    });
    expect(first).toMatchObject({
      total: 505,
      page: 1,
      counts: { all: 506, pending: 505 },
      approvedOwners: 1,
    });
    const last = await members.query(owner, {
      status: "pending",
      pageSize: 100,
      page: 6,
    });
    expect(last.members).toHaveLength(5);
    expect(
      last.members.some((item) =>
        first.members.some((prior) => prior.id === item.id),
      ),
    ).toBe(false);
    expect(
      (await members.query(owner, { search: "Applicant 504" })).members,
    ).toHaveLength(1);
    const target = first.members[0];
    expect(
      await members.decide(owner, {
        membershipId: target.id,
        expectedVersion: target.version,
        status: "approved",
      }),
    ).toMatchObject({ status: "approved", role: "member", version: 2 });
    await expect(
      members.decide(owner, {
        membershipId: target.id,
        expectedVersion: 1,
        status: "rejected",
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_CHANGED" });
    await expect(
      members.changeRole(owner, {
        membershipId: target.id,
        expectedVersion: 1,
        role: "editor",
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_CHANGED" });
    expect(
      await members.changeRole(owner, {
        membershipId: target.id,
        expectedVersion: 2,
        role: "editor",
      }),
    ).toMatchObject({ status: "approved", role: "editor", version: 3 });
    await expect(
      members.decide(owner, {
        membershipId: target.id,
        expectedVersion: 3,
        status: "pending",
      }),
    ).rejects.toMatchObject({ code: "PENDING_ROLE_INVALID" });
    expect(
      (await members.query(owner, { search: "Applicant 000" })).members[0],
    ).toMatchObject({ status: "approved", role: "editor", version: 3 });
  });
}
