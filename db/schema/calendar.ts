import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";
import { user } from "./auth";
import type {
  CalendarDefinition,
  CalendarPageDefinition,
  ScheduleDefinition,
} from "../../src/features/calendar/calendar_schemas";

export const calendar = club.table(
  "calendar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    draft: jsonb("draft").$type<CalendarDefinition>().notNull(),
    published: jsonb("published").$type<CalendarDefinition>(),
    version: integer("version").notNull().default(1),
    archived: boolean("archived").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("calendar_scope").on(t.id, t.organizationId),
    index("calendar_org").on(t.organizationId),
    check("calendar_version", sql`${t.version} > 0`),
  ],
);

export const calendarSchedule = club.table(
  "calendar_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    calendarId: uuid("calendar_id").notNull(),
    draft: jsonb("draft").$type<ScheduleDefinition>().notNull(),
    published: jsonb("published").$type<ScheduleDefinition>(),
    version: integer("version").notNull().default(1),
    archived: boolean("archived").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.calendarId, t.organizationId],
      foreignColumns: [calendar.id, calendar.organizationId],
    }),
    index("schedule_calendar").on(t.calendarId, t.organizationId),
    index("schedule_org").on(t.organizationId),
    check("schedule_version", sql`${t.version} > 0`),
  ],
);

export const calendarPage = club.table("calendar_page", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organization.id),
  draft: jsonb("draft").$type<CalendarPageDefinition>().notNull(),
  published: jsonb("published").$type<CalendarPageDefinition>(),
  version: integer("version").notNull().default(1),
});

export const calendarSubscription = club.table(
  "calendar_subscription",
  {
    emailVersion: uuid("email_version").notNull().defaultRandom(),
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    calendarId: uuid("calendar_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    active: boolean("active").notNull().default(true),
    email: boolean("email").notNull().default(true),
    updates: boolean("updates").notNull().default(true),
    reminderMinutes: integer("reminder_minutes").notNull().default(1440),
    fingerprint: text("fingerprint").notNull(),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("calendar_subscriber").on(t.calendarId, t.userId),
    unique("calendar_subscription_scope").on(t.id, t.organizationId),
    foreignKey({
      columns: [t.calendarId, t.organizationId],
      foreignColumns: [calendar.id, calendar.organizationId],
    }),
    index("calendar_subscription_user").on(t.userId),
    index("calendar_subscription_queue").on(t.active, t.checkedAt),
    index("calendar_subscription_org").on(t.organizationId),
    check("calendar_reminder", sql`${t.reminderMinutes} in (0,60,1440)`),
  ],
);

export const calendarNotification = club.table(
  "calendar_notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    key: text("key").notNull(),
    kind: text("kind", { enum: ["update", "reminder"] }).notNull(),
    status: text("status", {
      enum: ["pending", "processing", "sent", "cancelled", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    unique("calendar_notice_key").on(t.subscriptionId, t.key),
    foreignKey({
      columns: [t.subscriptionId, t.organizationId],
      foreignColumns: [
        calendarSubscription.id,
        calendarSubscription.organizationId,
      ],
    }),
    index("calendar_notice_queue").on(t.status, t.availableAt),
    index("calendar_notice_org").on(t.organizationId),
    check("calendar_notice_kind", sql`${t.kind} in ('update','reminder')`),
    check(
      "calendar_notice_status",
      sql`${t.status} in ('pending','processing','sent','cancelled','failed')`,
    ),
    check("calendar_notice_attempts", sql`${t.attempts} between 0 and 5`),
  ],
);
