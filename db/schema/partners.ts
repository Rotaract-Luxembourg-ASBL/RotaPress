import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";

export const partner = club.table(
  "partner",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    version: integer("version").notNull().default(1),
    draft: jsonb("draft").notNull(),
    published: jsonb("published"),
    previous: jsonb("previous"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("partner_organization").on(table.organizationId),
    check("partner_version_positive", sql`${table.version} > 0`),
  ],
);
