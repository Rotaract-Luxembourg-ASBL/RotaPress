import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { clubEvent } from "./events";
import { user } from "./auth";

export const eventPrize = club.table(
  "event_prize",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    draft: jsonb("draft").notNull(),
    version: integer("version").notNull().default(1),
    publishedRevisionId: uuid("published_revision_id"),
  },
  (t) => [
    unique("prize_scope").on(t.id, t.eventId, t.organizationId),
    index("prize_event").on(t.eventId),
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    check("prize_version", sql`${t.version} > 0`),
  ],
);

export const eventPrizeRevision = club.table(
  "event_prize_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prizeId: uuid("prize_id").notNull(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("prize_revision_scope").on(
      t.id,
      t.prizeId,
      t.eventId,
      t.organizationId,
    ),
    index("prize_revision_history").on(t.prizeId, t.createdAt),
    foreignKey({
      columns: [t.prizeId, t.eventId, t.organizationId],
      foreignColumns: [
        eventPrize.id,
        eventPrize.eventId,
        eventPrize.organizationId,
      ],
    }),
  ],
);
// The scoped publication pointer is added after both tables exist in reviewed SQL.
