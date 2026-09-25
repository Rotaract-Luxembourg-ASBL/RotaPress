import { jsonb, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { club, organization } from "./club";
import { user } from "./auth";

/** Receipts make content imports atomic and safe to retry; no source HTML is stored. */
export const automationImport = club.table(
  "automation_import",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    requestId: uuid("request_id").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    inputHash: text("input_hash").notNull(),
    receipt: jsonb("receipt").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.requestId] })],
);
