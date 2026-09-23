import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { club, membership, organization } from "./club";

export const clubEvent = club.table(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    title: text("title").notNull(),
    slug: text("slug")
      .notNull()
      .default(sql`'event-' || gen_random_uuid()::text`),
    featured: boolean("featured").notNull().default(false),
    description: text("description").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull(),
    venue: text("venue").notNull().default(""),
    visibility: text("visibility", { enum: ["public", "unlisted", "private"] })
      .notNull()
      .default("private"),
    version: integer("version").notNull().default(1),
    published: jsonb("published"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    creationRequestId: uuid("creation_request_id"),
    creationReviewToken: text("creation_review_token"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("event_scope").on(table.id, table.organizationId),
    unique("event_slug_scope").on(table.organizationId, table.slug),
    uniqueIndex("event_one_featured")
      .on(table.organizationId)
      .where(sql`${table.featured} = true`),
    check(
      "event_slug_format",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${table.slug}) <= 160`,
    ),
    uniqueIndex("event_creation_request")
      .on(table.organizationId, table.createdBy, table.creationRequestId)
      .where(sql`${table.creationRequestId} is not null`),
    check(
      "event_creation_receipt",
      sql`(${table.creationRequestId} is null and ${table.creationReviewToken} is null) or (${table.creationRequestId} is not null and ${table.creationReviewToken} is not null and ${table.creationReviewToken} ~ '^[a-f0-9]{64}$')`,
    ),
    index("event_organization_start").on(table.organizationId, table.startsAt),
    check(
      "event_visibility",
      sql`${table.visibility} in ('public', 'unlisted', 'private')`,
    ),
    check("event_version_positive", sql`${table.version} > 0`),
    check(
      "event_date_order",
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const eventModule = club.table(
  "event_module",
  {
    lastDisabledAt: timestamp("last_disabled_at", { withTimezone: true }),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    key: text("key", {
      enum: [
        "website",
        "gallery",
        "sponsors",
        "forms",
        "registration",
        "portal",
        "prizes",
      ],
    }).notNull(),
    state: text("state", {
      enum: ["enabled", "disabled", "suspended"],
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.key] }),
    unique("event_module_scope").on(
      table.eventId,
      table.key,
      table.organizationId,
    ),
    foreignKey({
      columns: [table.eventId, table.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    check(
      "event_module_key",
      sql`${table.key} in ('website', 'gallery', 'sponsors', 'forms', 'registration', 'portal', 'prizes')`,
    ),
    check(
      "event_module_state",
      sql`${table.state} in ('enabled', 'disabled', 'suspended')`,
    ),
  ],
);

// Retain the original table and manager rows; extend grants with scoped editors.
// The unique manager remains responsible. All requests require approved membership.
export const eventManager = club.table(
  "event_manager",
  {
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["manager", "editor", "registration-manager"] })
      .notNull()
      .default("manager"),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    uniqueIndex("event_responsible_manager")
      .on(table.eventId)
      .where(sql`${table.role} = 'manager'`),
    check(
      "event_assignment_role",
      sql`${table.role} in ('manager', 'editor', 'registration-manager')`,
    ),
    foreignKey({
      columns: [table.eventId, table.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [membership.organizationId, membership.userId],
    }),
    index("event_manager_user").on(table.organizationId, table.userId),
  ],
);
