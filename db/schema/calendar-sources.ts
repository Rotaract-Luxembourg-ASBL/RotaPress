import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { calendar } from "./calendar";
import { user } from "./auth";

export const calendarSource = club.table(
  "calendar_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    calendarId: uuid("calendar_id").notNull(),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    endpoint: text("endpoint"),
    host: text("host"),
    draft: text("draft").notNull(),
    published: text("published"),
    version: integer("version").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    automatic: boolean("automatic").notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    sessionId: text("session_id").notNull(),
    authorizedAt: timestamp("authorized_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
  },
  (t) => [
    foreignKey({
      columns: [t.calendarId, t.organizationId],
      foreignColumns: [calendar.id, calendar.organizationId],
    }),
    index("calendar_source_calendar").on(t.calendarId, t.organizationId),
    index("calendar_source_org").on(t.organizationId),
    index("calendar_source_actor").on(t.createdBy),
    index("calendar_source_queue").on(t.enabled, t.nextSyncAt),
    check("calendar_source_version", sql`${t.version} > 0`),
    check(
      "calendar_source_size",
      sql`octet_length(${t.draft}) <= 524288 and (${t.published} is null or octet_length(${t.published}) <= 524288)`,
    ),
  ],
);
