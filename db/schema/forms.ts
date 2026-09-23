import { sql } from "drizzle-orm";
import {
  boolean,
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
import { user } from "./auth";
import { club, organization } from "./club";
import { clubEvent } from "./events";

export const form = club.table(
  "form",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    eventId: uuid("event_id"),
    kind: text("kind", {
      enum: ["contact", "membership", "event", "registration"],
    }).notNull(),
    archived: boolean("archived").notNull().default(false),
    draftRevision: integer("draft_revision").notNull().default(1),
    draft: jsonb("draft").notNull(),
    publishedVersionId: uuid("published_version_id"),
    recipients: jsonb("recipients").notNull().default([]),
    retentionDays: integer("retention_days"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("form_id_org").on(table.id, table.organizationId),
    unique("form_event_scope").on(
      table.id,
      table.eventId,
      table.organizationId,
    ),
    index("form_event").on(table.organizationId, table.eventId),
    foreignKey({
      columns: [table.eventId, table.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    check(
      "form_kind",
      sql`${table.kind} in ('contact', 'membership', 'event', 'registration')`,
    ),
    check(
      "form_event_kind",
      sql`(${table.eventId} is null and ${table.kind} in ('contact', 'membership')) or (${table.eventId} is not null and ${table.kind} in ('event', 'registration'))`,
    ),
    check("form_draft_revision", sql`${table.draftRevision} > 0`),
    check(
      "form_retention_days",
      sql`${table.retentionDays} is null or ${table.retentionDays} between 1 and 36500`,
    ),
  ],
);

export const formVersion = club.table(
  "form_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    number: integer("number").notNull(),
    definition: jsonb("definition").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("form_version_id_form_org").on(
      table.id,
      table.formId,
      table.organizationId,
    ),
    unique("form_version_form_number").on(table.formId, table.number),
    foreignKey({
      name: "form_version_form_scope",
      columns: [table.formId, table.organizationId],
      foreignColumns: [form.id, form.organizationId],
    }).onDelete("cascade"),
    check("form_version_number", sql`${table.number} > 0`),
  ],
);

// The reviewed migration adds the composite published pointer after both tables
// exist: form(published_version_id,id,organization_id) -> form_version(id,form_id,organization_id).
// Runtime UPDATE/DELETE/TRUNCATE privileges on immutable form_version are revoked.
// Versions are only erased by the parent form's permanent deletion cascade.
export const formSubmission = club.table(
  "form_submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    formId: uuid("form_id").notNull(),
    versionId: uuid("version_id").notNull(),
    requestId: uuid("request_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    answers: jsonb("answers").notNull(),
    submittedByUserId: text("submitted_by_user_id").references(() => user.id),
    membershipStatus: text("membership_status", {
      enum: ["pending", "approved"],
    }),
    status: text("status", { enum: ["new", "reviewing", "closed"] })
      .notNull()
      .default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("form_submission_id_form_org").on(
      table.id,
      table.formId,
      table.organizationId,
    ),
    unique("form_submission_request").on(table.formId, table.requestId),
    foreignKey({
      name: "form_submission_version_scope",
      columns: [table.versionId, table.formId, table.organizationId],
      foreignColumns: [
        formVersion.id,
        formVersion.formId,
        formVersion.organizationId,
      ],
    }),
    index("form_submission_form_created").on(table.formId, table.createdAt),
    check(
      "form_submission_status",
      sql`${table.status} in ('new', 'reviewing', 'closed')`,
    ),
    check(
      "form_submission_membership",
      sql`${table.membershipStatus} is null or (${table.membershipStatus} in ('pending', 'approved') and ${table.submittedByUserId} is not null)`,
    ),
  ],
);

export const formNotification = club.table(
  "form_notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    formId: uuid("form_id").notNull(),
    submissionId: uuid("submission_id").notNull(),
    recipient: text("recipient").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "sent", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("form_notification_submission_recipient").on(
      table.submissionId,
      table.recipient,
    ),
    foreignKey({
      name: "form_notification_submission_scope",
      columns: [table.submissionId, table.formId, table.organizationId],
      foreignColumns: [
        formSubmission.id,
        formSubmission.formId,
        formSubmission.organizationId,
      ],
    }).onDelete("cascade"),
    index("form_notification_pending").on(table.status, table.availableAt),
    check(
      "form_notification_status",
      sql`${table.status} in ('pending', 'processing', 'sent', 'failed')`,
    ),
    check("form_notification_attempts", sql`${table.attempts} >= 0`),
    check(
      "form_notification_lease",
      sql`(${table.status} = 'processing') = (${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null)`,
    ),
  ],
);
