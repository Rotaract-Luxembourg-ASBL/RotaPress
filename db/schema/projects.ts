import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";

export const project = club.table(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    slug: text("slug").notNull(),
    version: integer("version").notNull().default(1),
    draft: jsonb("draft").notNull(),
    published: jsonb("published"),
    archived: boolean("archived").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("project_organization_slug").on(table.organizationId, table.slug),
    index("project_organization_updated").on(
      table.organizationId,
      table.updatedAt,
    ),
    check("project_version_positive", sql`${table.version} > 0`),
    check(
      "project_slug",
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${table.slug}) <= 180`,
    ),
    check(
      "project_archived_private",
      sql`not ${table.archived} or ${table.published} is null`,
    ),
  ],
);
