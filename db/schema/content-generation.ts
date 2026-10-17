import { timestamp, uuid } from "drizzle-orm/pg-core";
import { club, organization } from "./club";

/** An operator reset invalidates old content requests without changing identity or grants. */
export const contentGeneration = club.table("content_generation", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organization.id),
  generation: uuid("generation").notNull().defaultRandom(),
  resetAt: timestamp("reset_at", { withTimezone: true }),
});
