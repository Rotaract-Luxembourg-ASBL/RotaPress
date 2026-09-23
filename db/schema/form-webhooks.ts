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
import { form, formSubmission } from "./forms";

export const formWebhook = club.table(
  "form_webhook",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    formId: uuid("form_id").notNull(),
    endpoint: text("endpoint").notNull(),
    secret: text("secret").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("form_webhook_form").on(table.formId),
    unique("form_webhook_scope").on(
      table.id,
      table.formId,
      table.organizationId,
    ),
    foreignKey({
      columns: [table.formId, table.organizationId],
      foreignColumns: [form.id, form.organizationId],
    }).onDelete("cascade"),
    check("form_webhook_revision", sql`${table.revision} > 0`),
  ],
);

export const formWebhookDelivery = club.table(
  "form_webhook_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    formId: uuid("form_id").notNull(),
    submissionId: uuid("submission_id").notNull(),
    webhookId: uuid("webhook_id").notNull(),
    revision: integer("revision").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "sent", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    unique("form_webhook_submission").on(table.webhookId, table.submissionId),
    foreignKey({
      columns: [table.webhookId, table.formId, table.organizationId],
      foreignColumns: [
        formWebhook.id,
        formWebhook.formId,
        formWebhook.organizationId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.submissionId, table.formId, table.organizationId],
      foreignColumns: [
        formSubmission.id,
        formSubmission.formId,
        formSubmission.organizationId,
      ],
    }).onDelete("cascade"),
    index("form_webhook_queue").on(table.status, table.availableAt),
    index("form_webhook_history").on(table.formId, table.createdAt),
    index("form_webhook_response").on(table.submissionId),
    check(
      "form_webhook_delivery_status",
      sql`${table.status} in ('pending', 'processing', 'sent', 'failed', 'cancelled')`,
    ),
    check(
      "form_webhook_delivery_attempts",
      sql`${table.attempts} >= 0 and ${table.revision} > 0`,
    ),
    check(
      "form_webhook_delivery_lease",
      sql`(${table.status} = 'processing') = (${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null)`,
    ),
  ],
);
