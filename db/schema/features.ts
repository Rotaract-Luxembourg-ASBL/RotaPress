import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";

/** Club-wide availability; event modules retain their own saved configuration. */
export const clubFeature = club.table(
  "feature",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    key: text("key", { enum: ["forms", "events", "calendar"] }).notNull(),
    enabled: boolean("enabled").notNull(),
    version: integer("version").notNull(),
    lastDisabledAt: timestamp("last_disabled_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.key] }),
    check("feature_key", sql`${t.key} in ('forms', 'events', 'calendar')`),
    check("feature_version", sql`${t.version} > 0`),
    check(
      "feature_disabled_at",
      sql`${t.enabled} or ${t.lastDisabledAt} is not null`,
    ),
  ],
);
