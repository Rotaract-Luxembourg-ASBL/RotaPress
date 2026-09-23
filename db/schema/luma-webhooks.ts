import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";

export const lumaWebhook = club.table(
  "luma_webhook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    secret: text("secret"),
    enabled: boolean("enabled").notNull().default(false),
    eventTypes: text("event_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    unique("luma_webhook_organization").on(t.organizationId),
    check("luma_webhook_version", sql`${t.version} > 0`),
    check(
      "luma_webhook_enabled",
      sql`not ${t.enabled} or (${t.secret} is not null and cardinality(${t.eventTypes}) > 0)`,
    ),
    check(
      "luma_webhook_types",
      sql`${t.eventTypes} <@ ARRAY['event.created','event.updated','event.canceled','guest.registered','guest.updated','guest.refunded']::text[]`,
    ),
  ],
);

// Never retain a request body, signing header, guest identity or payment fields.
export const lumaWebhookReceipt = club.table(
  "luma_webhook_receipt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => lumaWebhook.id),
    bodyHash: text("body_hash").notNull(),
    eventType: text("event_type").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("luma_webhook_delivery_body").on(t.webhookId, t.bodyHash),
    index("luma_webhook_receipt_recent").on(t.webhookId, t.receivedAt),
    check("luma_webhook_body_hash", sql`${t.bodyHash} ~ '^[a-f0-9]{64}$'`),
  ],
);
