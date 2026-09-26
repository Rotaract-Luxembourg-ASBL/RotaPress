import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";

/** Independent transport switches. Credentials never imply that an interface is enabled. */
export const automationAvailability = club.table(
  "automation_availability",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    kind: text("kind", { enum: ["rest", "mcp"] }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.kind] }),
    check("automation_availability_kind", sql`${t.kind} in ('rest', 'mcp')`),
    check("automation_availability_version", sql`${t.version} > 0`),
  ],
);
