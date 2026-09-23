import {
  foreignKey,
  index,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";
import { clubEvent } from "./events";

export const siteDomain = club.table(
  "site_domain",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    hostname: text("hostname").notNull(),
    eventId: uuid("event_id"),
    challenge: text("challenge").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("site_domain_host").on(table.hostname),
    index("site_domain_organization").on(table.organizationId),
    foreignKey({
      name: "site_domain_event_scope",
      columns: [table.eventId, table.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
  ],
);
