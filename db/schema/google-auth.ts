import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";

// A retained disabled row deliberately overrides any legacy environment credential.
export const googleAuthConfiguration = club.table(
  "google_auth_configuration",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    clientId: text("client_id"),
    hostedDomain: text("hosted_domain").notNull().default(""),
    clientSecret: text("client_secret"),
    enabled: boolean("enabled").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("google_auth_version", sql`${table.version} > 0`),
    check(
      "google_auth_credentials",
      sql`(${table.clientId} is null) = (${table.clientSecret} is null)`,
    ),
    check(
      "google_auth_enabled",
      sql`not ${table.enabled} or ${table.clientSecret} is not null`,
    ),
  ],
);
