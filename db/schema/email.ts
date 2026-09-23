import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";
import { calendar } from "./calendar";
import { form } from "./forms";
import type {
  EmailTemplate,
  EmailTemplateKey,
  SmtpSettings,
} from "../../src/integrations/email/email_schemas";

export const emailConnection = club.table(
  "email_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider", { enum: ["smtp", "resend"] }).notNull(),
    senderName: text("sender_name").notNull(),
    senderEmail: text("sender_email").notNull(),
    replyTo: text("reply_to").notNull().default(""),
    smtp: jsonb("smtp").$type<SmtpSettings | null>(),
    secret: text("secret").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    version: integer("version").notNull().default(1),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("email_connection_default")
      .on(t.organizationId)
      .where(sql`${t.isDefault}`),
    check("email_connection_provider", sql`${t.provider} in ('smtp','resend')`),
    check("email_connection_version", sql`${t.version} > 0`),
    check(
      "email_connection_verified_default",
      sql`not ${t.isDefault} or ${t.verifiedAt} is not null`,
    ),
    check(
      "email_connection_settings",
      sql`(${t.provider} = 'smtp') = (${t.smtp} is not null)`,
    ),
  ],
);

export const emailTemplate = club.table(
  "email_template",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    key: text("key").$type<EmailTemplateKey>().notNull(),
    draft: jsonb("draft").$type<EmailTemplate>().notNull(),
    published: jsonb("published").$type<EmailTemplate>(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.key] }),
    check(
      "email_template_key",
      sql`${t.key} in ('verification','form_submission','calendar_update','calendar_reminder')`,
    ),
    check("email_template_version", sql`${t.version} > 0`),
  ],
);

export const emailTemplateOverride = club.table(
  "email_template_override",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    calendarId: uuid("calendar_id"),
    formId: uuid("form_id"),
    key: text("key").$type<EmailTemplateKey>().notNull(),
    draft: jsonb("draft").$type<EmailTemplate>().notNull(),
    published: jsonb("published").$type<EmailTemplate>(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    foreignKey({
      columns: [t.calendarId, t.organizationId],
      foreignColumns: [calendar.id, calendar.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.formId, t.organizationId],
      foreignColumns: [form.id, form.organizationId],
    }).onDelete("cascade"),
    unique("email_calendar_template").on(t.calendarId, t.key),
    unique("email_form_template").on(t.formId, t.key),
    check(
      "email_template_override_scope",
      sql`(${t.calendarId} is not null and ${t.formId} is null and ${t.key} in ('calendar_update','calendar_reminder')) or (${t.formId} is not null and ${t.calendarId} is null and ${t.key} = 'form_submission')`,
    ),
    check("email_template_override_version", sql`${t.version} > 0`),
  ],
);
