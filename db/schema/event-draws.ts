import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { clubEvent } from "./events";
import { user } from "./auth";
import { eventPrize } from "./event-prizes";

/** Frozen rules/eligibility and results are immutable; reviews append lifecycle decisions. */
export const eventDraw = club.table(
  "event_draw",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    mode: text("mode", { enum: ["demo"] })
      .notNull()
      .default("demo"),
    snapshot: jsonb("snapshot").notNull(),
    digest: text("digest").notNull(),
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
    unique("draw_scope").on(t.id, t.eventId, t.organizationId),
    unique("draw_request").on(t.organizationId, t.requestId),
    index("draw_event").on(t.eventId, t.organizationId),
    index("draw_creator").on(t.createdBy),
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    check(
      "draw_demo_only",
      sql`${t.mode} = 'demo' and ${t.snapshot}->>'mode' = 'demo'`,
    ),
    check("draw_digest", sql`${t.digest} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const eventDrawResult = club.table(
  "event_draw_result",
  {
    drawId: uuid("draw_id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    awards: jsonb("awards").notNull(),
    digest: text("digest").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("draw_result_event").on(t.eventId, t.organizationId),
    index("draw_result_creator").on(t.createdBy),
    foreignKey({
      columns: [t.drawId, t.eventId, t.organizationId],
      foreignColumns: [
        eventDraw.id,
        eventDraw.eventId,
        eventDraw.organizationId,
      ],
    }),
    check("draw_result_digest", sql`${t.digest} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const eventDrawReview = club.table(
  "event_draw_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drawId: uuid("draw_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    version: integer("version").notNull(),
    operation: text("operation", {
      enum: ["cancel", "publish", "unpublish"],
    }).notNull(),
    reason: text("reason").notNull(),
    publicWinners: jsonb("public_winners").notNull(),
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
    unique("draw_review_version").on(t.drawId, t.version),
    unique("draw_review_request").on(t.organizationId, t.requestId),
    index("draw_review_event").on(t.eventId, t.organizationId),
    index("draw_review_creator").on(t.createdBy),
    foreignKey({
      columns: [t.drawId, t.eventId, t.organizationId],
      foreignColumns: [
        eventDraw.id,
        eventDraw.eventId,
        eventDraw.organizationId,
      ],
    }),
    check("draw_review_version_positive", sql`${t.version} > 0`),
    check(
      "draw_review_operation",
      sql`${t.operation} in ('cancel', 'publish', 'unpublish')`,
    ),
    check(
      "draw_review_reason",
      sql`length(trim(${t.reason})) between 5 and 1000`,
    ),
    check(
      "draw_review_publication",
      sql`jsonb_typeof(${t.publicWinners}) = 'array' and (${t.operation} = 'publish' or ${t.publicWinners} = '[]'::jsonb)`,
    ),
  ],
);

/** Current reservations prevent two active draws from awarding the same prize unit. */
export const eventDrawSlot = club.table(
  "event_draw_slot",
  {
    drawId: uuid("draw_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    prizeId: uuid("prize_id").notNull(),
    unit: integer("unit").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.drawId, t.prizeId, t.unit] }),
    unique("draw_reserved_prize_unit").on(t.prizeId, t.unit),
    index("draw_slot_event").on(t.eventId, t.organizationId),
    foreignKey({
      columns: [t.drawId, t.eventId, t.organizationId],
      foreignColumns: [
        eventDraw.id,
        eventDraw.eventId,
        eventDraw.organizationId,
      ],
    }),
    foreignKey({
      columns: [t.prizeId, t.eventId, t.organizationId],
      foreignColumns: [
        eventPrize.id,
        eventPrize.eventId,
        eventPrize.organizationId,
      ],
    }),
    check("draw_slot_unit", sql`${t.unit} between 1 and 10000`),
  ],
);
