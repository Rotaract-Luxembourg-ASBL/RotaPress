import { z } from "zod";
import { membershipRoles, membershipStatuses } from "../../../db/schema/club";

export const membershipQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(160).default(""),
  status: z.enum(["all", ...membershipStatuses]).default("all"),
  role: z.enum(["all", ...membershipRoles]).default("all"),
});
export const membershipChangeSchema = z.strictObject({
  membershipId: z.uuid(),
  status: z.enum(membershipStatuses),
  role: z.enum(membershipRoles),
  expectedVersion: z.int().positive(),
});
export const membershipDecisionSchema = z.strictObject({
  membershipId: z.uuid(),
  expectedVersion: z.int().positive(),
  status: z.enum(membershipStatuses),
});
export const membershipRoleSchema = z.strictObject({
  membershipId: z.uuid(),
  expectedVersion: z.int().positive(),
  role: z.enum(membershipRoles),
});
export type MembershipQuery = z.output<typeof membershipQuerySchema>;
