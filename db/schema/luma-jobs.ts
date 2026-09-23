import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { user } from "./auth";
import { lumaApiEvent } from "./luma-sync";
import { lumaConnection } from "./integrations";

/** Delivery metadata only; credentials and provider guest data never enter a job. */
export const lumaReconciliationJob = club.table(
  "luma_reconciliation_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    connectionId: uuid("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    eventVersion: integer("event_version").notNull(),
    registrationVersion: integer("registration_version").notNull(),
    requestedVersion: integer("requested_version").notNull(),
    linkVersion: integer("link_version").notNull(),
    requestId: uuid("request_id").notNull(),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    // A library session identifier, never a bearer token. Receipts survive sign-out.
    sessionId: text("session_id").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status", {
      enum: ["pending", "processing", "succeeded", "cancelled", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    errorCode: text("error_code"),
  },
  (t) => [
    foreignKey({
      name: "luma_job_api_source_scope",
      columns: [t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaApiEvent.sourceId,
        lumaApiEvent.eventId,
        lumaApiEvent.organizationId,
      ],
    }),
    foreignKey({
      columns: [t.connectionId, t.organizationId],
      foreignColumns: [lumaConnection.id, lumaConnection.organizationId],
    }),
    unique("luma_job_request").on(t.organizationId, t.requestId),
    uniqueIndex("luma_job_active")
      .on(t.sourceId)
      .where(sql`${t.status} in ('pending', 'processing')`),
    index("luma_job_due")
      .on(t.availableAt)
      .where(sql`${t.status} in ('pending', 'processing')`),
    index("luma_job_history").on(t.sourceId, t.createdAt),
    check(
      "luma_job_status",
      sql`${t.status} in ('pending', 'processing', 'succeeded', 'cancelled', 'failed')`,
    ),
    check("luma_job_attempts", sql`${t.attempts} between 0 and 3`),
    check(
      "luma_job_versions",
      sql`${t.sourceVersion} > 0 and ${t.connectionVersion} > 0 and ${t.eventVersion} > 0 and ${t.registrationVersion} >= 0 and ${t.requestedVersion} > 0 and ${t.linkVersion} >= ${t.requestedVersion}`,
    ),
    check(
      "luma_job_lease",
      sql`(${t.status} = 'processing' and ${t.leaseToken} is not null and ${t.leaseExpiresAt} is not null) or (${t.status} <> 'processing' and ${t.leaseToken} is null and ${t.leaseExpiresAt} is null)`,
    ),
    check(
      "luma_job_completion",
      sql`(${t.status} in ('pending', 'processing')) = (${t.finishedAt} is null)`,
    ),
  ],
);
