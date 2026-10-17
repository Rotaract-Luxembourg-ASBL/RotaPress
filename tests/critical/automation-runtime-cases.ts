import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { z } from "zod";
import { automationReceipt } from "../../db/schema/automation-runtime";
import { membership } from "../../db/schema/club";
import { MembershipService } from "../../src/features/members/MembershipService";
import { AutomationRuntime } from "../../src/integrations/automation/receipt_service";
import { executeOperation } from "../../src/integrations/automation/catalogue";
import type { AutomationContext } from "../../src/integrations/automation/operation";
import type { Context } from "./luma-sync-fixture";

/** Reuses the principal event suite's isolated real PostgreSQL lifecycle. */
export function automationRuntimeChecks(get: () => Context) {
  async function fixture() {
    const c = get();
    const people = await c.club();
    const members = new MembershipService(c.db, c.authorization);
    const applicant = await c.actor("MCP private membership fixture");
    const applied = await members.apply(applicant);
    if (!applied) throw new Error("Missing synthetic membership.");
    const [target] = await c.db
      .select()
      .from(membership)
      .where(eq(membership.id, applied.id));
    const runtime = new AutomationRuntime(c.db);
    const context = {
      services: {
        authorization: c.authorization,
        members,
        automationRuntime: runtime,
      },
      principal: {
        actor: people.owner,
        organizationId: people.scope.organizationId,
        keyId: "runtime-fixture",
        scopes: ["members:read", "members:decide", "access:roles"],
        sourceOrigins: [],
      },
    } as unknown as AutomationContext;
    return { ...c, ...people, members, target, runtime, context };
  }

  it("C14 runtime: explicit membership grants, exact retries and separate role authority", async () => {
    const f = await fixture();
    const input = {
      membershipId: f.target.id,
      expectedVersion: f.target.version,
      status: "approved",
      requestId: randomUUID(),
      taskId: randomUUID(),
    };
    await expect(
      executeOperation(
        {
          ...f.context,
          principal: {
            ...f.context.principal,
            scopes: ["forms:write", "events:prepare"],
          },
        },
        "members_decide",
        input,
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
    const result = await executeOperation(f.context, "members_decide", input);
    expect(result).toMatchObject({
      id: f.target.id,
      status: "approved",
      role: "member",
      version: f.target.version + 1,
    });
    // Key ordering is not a new request; data and identity remain exact.
    expect(
      await executeOperation(
        f.context,
        "members_decide",
        Object.fromEntries(Object.entries(input).reverse()),
      ),
    ).toEqual(result);
    await expect(
      executeOperation(f.context, "members_decide", {
        ...input,
        status: "suspended",
      }),
    ).rejects.toMatchObject({ code: "AUTOMATION_REQUEST_CHANGED" });
    await expect(
      executeOperation(
        {
          ...f.context,
          principal: { ...f.context.principal, keyId: "another-connection" },
        },
        "members_decide",
        input,
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_REQUEST_CHANGED" });
    const receipt = await executeOperation(
      f.context,
      "automation_task_receipts",
      { taskId: input.taskId },
    );
    expect(receipt).toMatchObject({
      items: [
        {
          requestId: input.requestId,
          operation: "members_decide",
          state: "completed",
        },
      ],
    });
    expect(JSON.stringify(receipt)).not.toContain(f.target.userId);
    const [row] = await f.db
      .select()
      .from(membership)
      .where(eq(membership.id, f.target.id));
    expect(row.version).toBe(f.target.version + 1);
    await expect(
      executeOperation(
        {
          ...f.context,
          principal: { ...f.context.principal, scopes: ["members:decide"] },
        },
        "members_role_set",
        {
          membershipId: row.id,
          expectedVersion: row.version,
          role: "editor",
          requestId: randomUUID(),
        },
      ),
    ).rejects.toMatchObject({ code: "AUTOMATION_SCOPE_REQUIRED" });
  });

  it("C14 runtime: replay rechecks current membership and cannot change its own access", async () => {
    const f = await fixture();
    const input = {
      membershipId: f.target.id,
      expectedVersion: f.target.version,
      status: "approved",
      requestId: randomUUID(),
    };
    await executeOperation(f.context, "members_decide", input);
    const [ownerMembership] = await f.db
      .select()
      .from(membership)
      .where(
        and(
          eq(membership.organizationId, f.scope.organizationId),
          eq(membership.userId, f.owner.userId),
        ),
      );
    await expect(
      executeOperation(f.context, "members_role_set", {
        membershipId: ownerMembership.id,
        expectedVersion: ownerMembership.version,
        role: "editor",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "AUTOMATION_SELF_ACCESS" });
    await f.db
      .update(membership)
      .set({ status: "suspended" })
      .where(eq(membership.id, ownerMembership.id));
    await expect(
      executeOperation(f.context, "members_decide", input),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("C14 runtime: invalid output rolls back both domain changes and receipt", async () => {
    const f = await fixture();
    const requestId = randomUUID();
    await expect(
      f.runtime.execute(
        f.context,
        "fixture-invalid",
        { requestId },
        z.strictObject({ version: z.int() }),
        (tx) => f.authorization.require(f.owner, "members.manage", tx),
        async (tx) => {
          await tx
            .update(membership)
            .set({ status: "approved" })
            .where(eq(membership.id, f.target.id));
          return { version: "wrong" };
        },
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(
      (
        await f.db
          .select()
          .from(membership)
          .where(eq(membership.id, f.target.id))
      )[0].status,
    ).toBe("pending");
    expect(
      await f.db
        .select()
        .from(automationReceipt)
        .where(eq(automationReceipt.requestId, requestId)),
    ).toHaveLength(0);
  });
}
