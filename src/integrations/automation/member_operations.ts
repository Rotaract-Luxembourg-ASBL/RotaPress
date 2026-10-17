import { z } from "zod";
import { membershipRoles, membershipStatuses } from "../../../db/schema/club";
import {
  DomainError,
  type Transaction,
} from "@/core/authorization/AuthorizationService";
import { MembershipRepository } from "@/features/members/MembershipRepository";
import {
  membershipQuerySchema,
  membershipDecisionSchema,
  membershipRoleSchema,
} from "@/features/members/membership_schemas";
import { operation, type AutomationContext } from "./operation";
import { executeReceipt, receiptFields } from "./receipt_service";
import { exampleId } from "./examples";

const memberState = z.strictObject({
  id: z.uuid(),
  status: z.enum(membershipStatuses),
  role: z.enum(membershipRoles),
  version: z.int().positive(),
});
const member = memberState.extend({
  name: z.string(),
  email: z.email(),
  createdAt: z.iso.datetime(),
});
const memberPage = z.strictObject({
  members: z.array(member),
  total: z.int().nonnegative(),
  page: z.int().positive(),
  pageSize: z.int().positive(),
});

async function authorizeChange(
  context: AutomationContext,
  id: string,
  role: string | undefined,
  tx: Transaction,
) {
  const { actor, organizationId, scopes } = context.principal;
  context.services.authorization.requireRecent(actor);
  await context.services.authorization.require(actor, "members.manage", tx);
  const target = await new MembershipRepository(
    context.services.automationRuntime.database,
  ).target(id, organizationId, tx);
  if (!target)
    throw new DomainError(
      "MEMBERSHIP_NOT_FOUND",
      "This membership is unavailable.",
      404,
    );
  if (target.userId === actor.userId)
    throw new DomainError(
      "AUTOMATION_SELF_ACCESS",
      "An assistant cannot change its own account access. Use another authorized administrator.",
      403,
    );
  if (target.role === "owner" || role === "owner") {
    if (!scopes.includes("access:ownership"))
      throw new DomainError(
        "AUTOMATION_SCOPE_REQUIRED",
        "This connection needs access:ownership to change an owner.",
        403,
      );
    await context.services.authorization.require(actor, "ownership.manage", tx);
  }
}

export const memberOperations = [
  operation(
    {
      name: "members_list",
      method: "GET",
      path: "/members",
      scope: "members:read",
      effect: "read",
      description:
        "Search private member names, email, roles and membership decisions. Does not disclose authentication accounts or sessions.",
      input: membershipQuerySchema,
      output: memberPage,
      example: { page: 1, pageSize: 30, status: "pending" },
    },
    async ({ services, principal }, input) => {
      const result = await services.members.query(principal.actor, input);
      return {
        members: result.members.map((entry) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    },
  ),
  operation(
    {
      name: "members_decide",
      method: "POST",
      path: "/members/{membershipId}/decision",
      scope: "members:decide",
      effect: "access",
      description:
        "Apply the user's requested membership status to one exact current membership. Does not change its role. Requires recent identity; owner targets also require access:ownership. A requestId makes retries safe.",
      input: membershipDecisionSchema.extend(receiptFields),
      output: memberState,
      example: {
        membershipId: exampleId,
        expectedVersion: 1,
        status: "approved",
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "members_decide",
        input,
        memberState,
        (tx) => authorizeChange(context, input.membershipId, undefined, tx),
        (tx) =>
          context.services.members.decide(
            context.principal.actor,
            membershipDecisionSchema.parse({
              membershipId: input.membershipId,
              expectedVersion: input.expectedVersion,
              status: input.status,
            }),
            tx,
          ),
      ),
  ),
  operation(
    {
      name: "members_role_set",
      method: "POST",
      path: "/members/{membershipId}/role",
      scope: "access:roles",
      effect: "access",
      description:
        "Apply the explicitly requested staff role. Requires recent identity and exact version. Owner roles additionally require access:ownership. Cannot change this assistant's own account or connection grants.",
      input: membershipRoleSchema.extend(receiptFields),
      output: memberState,
      example: {
        membershipId: exampleId,
        expectedVersion: 1,
        role: "editor",
        requestId: exampleId,
      },
    },
    (context, input) =>
      executeReceipt(
        context,
        "members_role_set",
        input,
        memberState,
        (tx) => authorizeChange(context, input.membershipId, input.role, tx),
        (tx) =>
          context.services.members.changeRole(
            context.principal.actor,
            {
              membershipId: input.membershipId,
              expectedVersion: input.expectedVersion,
              role: input.role,
            },
            tx,
          ),
      ),
  ),
];
