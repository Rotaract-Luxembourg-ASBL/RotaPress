import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { lumaGuestProjection } from "./luma-sync";
import { lumaConnection } from "./integrations";

/** The provider account and each order retain their first verified guest owner. */
export const lumaPurchaseIdentity = club.table(
  "luma_purchase_identity",
  {
    guestId: uuid("guest_id").primaryKey(),
    sourceId: uuid("source_id").notNull(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    providerUserId: text("provider_user_id").notNull(),
  },
  (t) => [
    foreignKey({
      name: "purchase_identity_guest_scope",
      columns: [t.guestId, t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaGuestProjection.id,
        lumaGuestProjection.sourceId,
        lumaGuestProjection.eventId,
        lumaGuestProjection.organizationId,
      ],
    }),
    index("purchase_identity_event").on(t.eventId, t.organizationId),
    index("purchase_identity_source").on(t.sourceId),
  ],
);

export const lumaPurchaseOrder = club.table(
  "luma_purchase_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestId: uuid("guest_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    providerOrderId: text("provider_order_id").notNull(),
  },
  (t) => [
    foreignKey({
      name: "purchase_order_guest_scope",
      columns: [t.guestId, t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaGuestProjection.id,
        lumaGuestProjection.sourceId,
        lumaGuestProjection.eventId,
        lumaGuestProjection.organizationId,
      ],
    }),
    uniqueIndex("purchase_order_source_identity").on(
      t.sourceId,
      t.providerOrderId,
    ),
    index("purchase_order_guest").on(t.guestId),
    index("purchase_order_event").on(t.eventId, t.organizationId),
  ],
);

/** Completed observations are immutable; a failed attempt cannot replace evidence. */
export const lumaPurchaseRefresh = club.table(
  "luma_purchase_refresh",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestId: uuid("guest_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    requestId: uuid("request_id").notNull(),
    version: integer("version").notNull(),
    status: text("status", {
      enum: ["running", "succeeded", "failed"],
    }).notNull(),
    failureCode: text("failure_code", {
      enum: ["refresh_failed", "identity_changed"],
    }),
    mode: text("mode", { enum: ["fixture", "live"] }).notNull(),
    recipientEmail: text("recipient_email").notNull(),
    sourceVersion: integer("source_version").notNull(),
    apiVersion: integer("api_version").notNull(),
    connectionId: uuid("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    guestObservedAt: timestamp("guest_observed_at", {
      withTimezone: true,
    }).notNull(),
    snapshot: jsonb("snapshot").$type<unknown>(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "purchase_refresh_connection_scope",
      columns: [t.connectionId, t.organizationId],
      foreignColumns: [lumaConnection.id, lumaConnection.organizationId],
    }),
    foreignKey({
      name: "purchase_refresh_guest_scope",
      columns: [t.guestId, t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaGuestProjection.id,
        lumaGuestProjection.sourceId,
        lumaGuestProjection.eventId,
        lumaGuestProjection.organizationId,
      ],
    }),
    uniqueIndex("purchase_refresh_request").on(t.organizationId, t.requestId),
    uniqueIndex("purchase_refresh_entry_scope").on(
      t.id,
      t.guestId,
      t.eventId,
      t.organizationId,
    ),
    uniqueIndex("purchase_refresh_guest_version").on(t.guestId, t.version),
    index("purchase_refresh_event").on(t.eventId, t.organizationId),
    index("purchase_refresh_source").on(t.sourceId),
    index("purchase_refresh_connection").on(t.connectionId),
    check(
      "purchase_refresh_versions",
      sql`${t.version} > 0 and ${t.sourceVersion} > 0 and ${t.apiVersion} > 0 and ${t.connectionVersion} > 0`,
    ),
    check(
      "purchase_refresh_state",
      sql`(${t.status} = 'running' and ${t.finishedAt} is null and ${t.snapshot} is null) or (${t.status} = 'failed' and ${t.finishedAt} is not null and ${t.snapshot} is null) or (${t.status} = 'succeeded' and ${t.finishedAt} is not null and ${t.snapshot} is not null)`,
    ),
    check("purchase_refresh_mode", sql`${t.mode} in ('fixture', 'live')`),
    check(
      "purchase_refresh_failure",
      sql`(${t.status} = 'failed' and ${t.failureCode} is not null and ${t.failureCode} in ('refresh_failed', 'identity_changed')) or (${t.status} <> 'failed' and ${t.failureCode} is null)`,
    ),
    check(
      "purchase_refresh_email",
      sql`${t.recipientEmail} = lower(trim(${t.recipientEmail})) and length(${t.recipientEmail}) between 3 and 254`,
    ),
  ],
);
