import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { club } from "./club";
import { clubEvent } from "./events";
import { user } from "./auth";
import { cmsContent } from "./cms";

/** Append-only editorial snapshots; no participant, provider or payment records. */
export const eventRevision = club.table(
  "event_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    eventVersion: integer("event_version").notNull(),
    action: text("action", {
      enum: ["created", "saved", "published", "restored", "baseline"],
    }).notNull(),
    fields: jsonb("fields").notNull(),
    pages: jsonb("pages").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.eventId, table.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    index("event_revision_history").on(table.eventId, table.createdAt),
    check(
      "event_revision_action",
      sql`${table.action} in ('created','saved','published','restored','baseline')`,
    ),
  ],
);

/** Temporary, session-bound previews, never CMS revisions or public pointers. */
export const cmsPreview = club.table(
  "cms_preview",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    sessionId: text("session_id").notNull(),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.contentId, table.organizationId],
      foreignColumns: [cmsContent.id, cmsContent.organizationId],
    }),
    index("cms_preview_expiry").on(table.expiresAt),
    index("cms_preview_session").on(table.userId, table.sessionId),
  ],
);
