import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const club = pgSchema("club");

export const membershipRoles = ["owner", "administrator", "editor", "member"] as const;
export const membershipStatuses = ["pending", "approved", "suspended", "rejected", "former"] as const;
export type MembershipRole = (typeof membershipRoles)[number];
export type MembershipStatus = (typeof membershipStatuses)[number];

export const organization = club.table("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  singleton: smallint("singleton").notNull().default(1).unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  description: text("description").notNull().default(""),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("Europe/Luxembourg"),
  accentColor: text("accent_color").notNull().default("#25636b"),
  staffAuthPolicy: text("staff_auth_policy", { enum: ["email-or-google", "google"] })
    .notNull().default("email-or-google"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("organization_singleton", sql`${table.singleton} = 1`),
  check("organization_staff_auth_policy", sql`${table.staffAuthPolicy} in ('email-or-google', 'google')`),
]);

export const installation = club.table("installation", {
  id: smallint("id").primaryKey().default(1),
  claimHash: text("claim_hash"),
  nominatedEmail: text("nominated_email").notNull(),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  organizationId: uuid("organization_id").references(() => organization.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("installation_singleton", sql`${table.id} = 1`),
  check("installation_completion", sql`(
    ${table.completedAt} is null and ${table.organizationId} is null
  ) or (
    ${table.completedAt} is not null and ${table.organizationId} is not null
    and ${table.claimHash} is null and ${table.claimExpiresAt} is null
  )`),
]);

export const membership = club.table("membership", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id),
  userId: text("user_id").notNull().references(() => user.id),
  role: text("role", { enum: membershipRoles }).notNull().default("member"),
  status: text("status", { enum: membershipStatuses }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("membership_organization_user").on(table.organizationId, table.userId),
  index("membership_organization_status").on(table.organizationId, table.status),
  check("membership_role", sql`${table.role} in ('owner', 'administrator', 'editor', 'member')`),
  check("membership_status", sql`${table.status} in ('pending', 'approved', 'suspended', 'rejected', 'former')`),
  check("membership_pending_role", sql`${table.status} != 'pending' or ${table.role} = 'member'`),
]);

export const auditEntry = club.table("audit_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id),
  actorUserId: text("actor_user_id").references(() => user.id),
  action: text("action").notNull(),
  targetId: text("target_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_entry_organization_created").on(table.organizationId, table.createdAt)]);

export const ownerRecovery = club.table("owner_recovery", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id),
  userId: text("user_id").notNull().references(() => user.id),
  nominatedEmail: text("nominated_email").notNull(),
  claimHash: text("claim_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("owner_recovery_user").on(table.userId)]);
