import {
  check,
  index,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { club, organization } from "./club";
import { user } from "./auth";
import { clubEvent } from "./events";

/** Immutable typed proposals; only a cookie-authenticated human review may apply one. */
export const automationProposal = club.table(
  "automation_proposal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => clubEvent.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    requestId: uuid("request_id").notNull(),
    inputHash: text("input_hash").notNull(),
    kind: text("kind", { enum: ["registration", "feature"] }).notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", { enum: ["pending", "applied", "rejected"] })
      .notNull()
      .default("pending"),
    reviewedBy: text("reviewed_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    unique("automation_proposal_request").on(
      t.organizationId,
      t.createdBy,
      t.requestId,
    ),
    index("automation_proposal_event").on(
      t.organizationId,
      t.eventId,
      t.createdAt,
    ),
    check(
      "automation_proposal_kind",
      sql`${t.kind} in ('registration', 'feature')`,
    ),
    check(
      "automation_proposal_status",
      sql`${t.status} in ('pending', 'applied', 'rejected')`,
    ),
  ],
);
