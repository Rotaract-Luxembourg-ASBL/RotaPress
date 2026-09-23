import {
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";
import { user } from "./auth";

/** Private self-service data. Public team profiles are separately published content. */
export const memberProfile = club.table(
  "member_profile",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    profile: jsonb("profile").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);
