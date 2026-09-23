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
import { clubEvent } from "./events";
import { user } from "./auth";
import { lumaGuestProjection } from "./luma-sync";
import { lumaPurchaseRefresh } from "./luma-purchases";

/** Entry identity is permanent. Quantities and decisions are append-only reviews. */
export const eventEntry = club.table(
  "event_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    mode: text("mode", { enum: ["demo"] })
      .notNull()
      .default("demo"),
    guestId: uuid("guest_id"),
    label: text("label").notNull(),
    reference: text("reference").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("entry_scope").on(t.id, t.eventId, t.organizationId),
    unique("entry_guest_scope").on(
      t.id,
      t.guestId,
      t.eventId,
      t.organizationId,
    ),
    uniqueIndex("entry_demo_reference")
      .on(t.eventId, t.reference)
      .where(sql`${t.guestId} is null`),
    uniqueIndex("entry_purchase_reference")
      .on(t.guestId, t.reference)
      .where(sql`${t.guestId} is not null`),
    index("entry_event").on(t.eventId, t.organizationId),
    index("entry_creator").on(t.createdBy),
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    foreignKey({
      columns: [t.guestId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaGuestProjection.id,
        lumaGuestProjection.eventId,
        lumaGuestProjection.organizationId,
      ],
    }),
    check("entry_demo_only", sql`${t.mode} = 'demo'`),
    check("entry_label", sql`length(trim(${t.label})) between 1 and 100`),
    check(
      "entry_reference",
      sql`length(trim(${t.reference})) between 1 and 240`,
    ),
  ],
);

export const eventEntryReview = club.table(
  "event_entry_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").notNull(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    guestId: uuid("guest_id"),
    version: integer("version").notNull(),
    quantity: integer("quantity").notNull(),
    decision: text("decision", { enum: ["approve", "hold", "void"] }).notNull(),
    reason: text("reason").notNull(),
    receiptId: uuid("receipt_id"),
    evidenceKey: text("evidence_key").notNull(),
    requestId: uuid("request_id").notNull(),
    requestHash: text("request_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("entry_review_version").on(t.entryId, t.version),
    unique("entry_review_request").on(t.organizationId, t.requestId),
    index("entry_review_event").on(t.eventId, t.organizationId),
    index("entry_review_receipt").on(t.receiptId),
    index("entry_review_creator").on(t.createdBy),
    foreignKey({
      columns: [t.entryId, t.eventId, t.organizationId],
      foreignColumns: [
        eventEntry.id,
        eventEntry.eventId,
        eventEntry.organizationId,
      ],
    }),
    foreignKey({
      name: "entry_review_guest_scope",
      columns: [t.entryId, t.guestId, t.eventId, t.organizationId],
      foreignColumns: [
        eventEntry.id,
        eventEntry.guestId,
        eventEntry.eventId,
        eventEntry.organizationId,
      ],
    }),
    foreignKey({
      name: "entry_review_receipt_scope",
      columns: [t.receiptId, t.guestId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaPurchaseRefresh.id,
        lumaPurchaseRefresh.guestId,
        lumaPurchaseRefresh.eventId,
        lumaPurchaseRefresh.organizationId,
      ],
    }),
    check("entry_review_version_positive", sql`${t.version} > 0`),
    check("entry_review_quantity", sql`${t.quantity} between 1 and 10000`),
    check(
      "entry_review_decision",
      sql`${t.decision} in ('approve', 'hold', 'void')`,
    ),
    check(
      "entry_review_reason",
      sql`length(trim(${t.reason})) between 5 and 1000`,
    ),
    check(
      "entry_review_receipt_guest",
      sql`${t.receiptId} is null or ${t.guestId} is not null`,
    ),
  ],
);
