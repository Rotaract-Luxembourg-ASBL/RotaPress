import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";
import { clubEvent } from "./events";

export const lumaConnection = club.table(
  "luma_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    credential: text("credential"),
    calendarId: text("calendar_id"),
    version: integer("version").notNull().default(1),
    checkState: text("check_state", {
      enum: ["unchecked", "checking", "verified", "failed", "disconnected"],
    })
      .notNull()
      .default("unchecked"),
    checkCode: text("check_code"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  },
  (t) => [
    unique("luma_connection_organization").on(t.organizationId),
    unique("luma_connection_scope").on(t.id, t.organizationId),
    check("luma_connection_version", sql`${t.version} > 0`),
    check(
      "luma_connection_state",
      sql`${t.checkState} in ('unchecked', 'checking', 'verified', 'failed', 'disconnected')`,
    ),
    check(
      "luma_connection_credential",
      sql`(${t.checkState} = 'disconnected') = (${t.credential} is null)`,
    ),
    check(
      "luma_connection_verified",
      sql`${t.checkState} <> 'verified' or (${t.calendarId} is not null and ${t.lastSuccessAt} is not null)`,
    ),
  ],
);

// Link mode stores no credentials and never contacts a provider.
export const lumaAvailability = club.table(
  "luma_availability",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organization.id),
    enabled: boolean("enabled").notNull().default(false),
    version: integer("version").notNull().default(1),
  },
  (t) => [check("luma_availability_version", sql`${t.version} > 0`)],
);

export const lumaEventLink = club.table(
  "luma_event_link",
  {
    eventId: uuid("event_id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    draftUrl: text("draft_url").notNull(),
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    check("luma_link_version", sql`${t.version} > 0`),
    check(
      "luma_link_publication",
      sql`${t.publishedAt} is null or ${t.publishedUrl} is not null`,
    ),
    check(
      "luma_link_urls",
      sql`${t.draftUrl} ~ '^https://(luma[.]com|lu[.]ma)/[A-Za-z0-9_-]+$' and (${t.publishedUrl} is null or ${t.publishedUrl} ~ '^https://(luma[.]com|lu[.]ma)/[A-Za-z0-9_-]+$')`,
    ),
  ],
);
