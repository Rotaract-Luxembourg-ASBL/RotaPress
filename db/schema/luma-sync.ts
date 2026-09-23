import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { clubEvent } from "./events";
import { lumaConnection } from "./integrations";
import { eventPackageSource } from "./event-packages";

export const lumaApiEvent = club.table(
  "luma_api_event",
  {
    sourceId: uuid("source_id").primaryKey(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    connectionId: uuid("connection_id").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    version: integer("version").notNull().default(1),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  },
  (t) => [
    unique("luma_api_event_scope").on(t.sourceId, t.eventId, t.organizationId),
    index("luma_api_event_index").on(t.eventId),
    unique("luma_api_provider_event").on(t.connectionId, t.providerEventId),
    foreignKey({
      name: "luma_api_source_scope",
      columns: [t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        eventPackageSource.id,
        eventPackageSource.eventId,
        eventPackageSource.organizationId,
      ],
    }),
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    foreignKey({
      columns: [t.connectionId, t.organizationId],
      foreignColumns: [lumaConnection.id, lumaConnection.organizationId],
    }),
    check("luma_api_event_version", sql`${t.version} > 0`),
  ],
);

export const lumaGuestProjection = club.table(
  "luma_guest_projection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    providerGuestId: text("provider_guest_id").notNull(),
    name: text("name"),
    email: text("email").notNull(),
    approvalStatus: text("approval_status", {
      enum: [
        "approved",
        "session",
        "pending_approval",
        "invited",
        "declined",
        "waitlist",
      ],
    }).notNull(),
    ticketCount: integer("ticket_count").notNull(),
    present: boolean("present").notNull().default(true),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    // A reconciliation marker, retained even after bounded run history is pruned.
    lastSeenRunId: uuid("last_seen_run_id").notNull(),
  },
  (t) => [
    unique("luma_guest_provider_identity").on(t.sourceId, t.providerGuestId),
    unique("luma_guest_scope").on(t.id, t.eventId, t.organizationId),
    unique("luma_guest_purchase_scope").on(
      t.id,
      t.sourceId,
      t.eventId,
      t.organizationId,
    ),
    foreignKey({
      name: "luma_guest_api_source_scope",
      columns: [t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaApiEvent.sourceId,
        lumaApiEvent.eventId,
        lumaApiEvent.organizationId,
      ],
    }),
    check(
      "luma_guest_ticket_count",
      sql`${t.ticketCount} >= 0 and ${t.ticketCount} <= 200`,
    ),
    check(
      "luma_guest_status",
      sql`${t.approvalStatus} in ('approved', 'session', 'pending_approval', 'invited', 'declined', 'waitlist')`,
    ),
  ],
);

export const lumaSyncRun = club.table(
  "luma_sync_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    requestId: uuid("request_id").notNull(),
    status: text("status", {
      enum: ["running", "succeeded", "failed", "interrupted"],
    }).notNull(),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    guestCount: integer("guest_count"),
  },
  (t) => [
    unique("luma_sync_request").on(t.eventId, t.requestId),
    index("luma_sync_history").on(t.sourceId, t.startedAt),
    foreignKey({
      name: "luma_sync_api_source_scope",
      columns: [t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaApiEvent.sourceId,
        lumaApiEvent.eventId,
        lumaApiEvent.organizationId,
      ],
    }),
    check(
      "luma_sync_status",
      sql`${t.status} in ('running', 'succeeded', 'failed', 'interrupted')`,
    ),
    check(
      "luma_sync_completion",
      sql`(${t.status} = 'running') = (${t.finishedAt} is null)`,
    ),
    check(
      "luma_sync_count",
      sql`${t.guestCount} is null or ${t.guestCount} between 0 and 1000`,
    ),
  ],
);
