import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { clubEvent } from "./events";
import { form, formSubmission } from "./forms";
import { user } from "./auth";

export const registrationSettings = club.table(
  "registration_settings",
  {
    eventId: uuid("event_id").primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    authority: text("authority", { enum: ["none", "native", "luma"] })
      .notNull()
      .default("none"),
    formId: uuid("form_id"),
    capacity: integer("capacity"),
    open: boolean("open").notNull().default(false),
    version: integer("version").notNull().default(1),
    externalLocked: boolean("external_locked").notNull().default(false),
  },
  (t) => [
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    foreignKey({
      columns: [t.formId, t.eventId, t.organizationId],
      foreignColumns: [form.id, form.eventId, form.organizationId],
    }),
    check(
      "registration_authority",
      sql`(${t.authority} = 'none' and ${t.formId} is null and ${t.open} = false) or (${t.authority} = 'native' and ${t.formId} is not null) or (${t.authority} = 'luma' and ${t.formId} is null and ${t.capacity} is null)`,
    ),
    check(
      "registration_external_lock",
      sql`not ${t.externalLocked} or ${t.authority} = 'luma'`,
    ),
    check(
      "registration_capacity",
      sql`${t.capacity} is null or ${t.capacity} > 0`,
    ),
    check("registration_version", sql`${t.version} > 0`),
  ],
);

export const eventRegistration = club.table(
  "event_registration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    formId: uuid("form_id").notNull(),
    submissionId: uuid("submission_id").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    eventTitle: text("event_title").notNull(),
    status: text("status", { enum: ["confirmed", "cancelled"] })
      .notNull()
      .default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    unique("registration_guest_scope").on(
      t.id,
      t.eventId,
      t.organizationId,
      t.userId,
    ),
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    foreignKey({
      columns: [t.formId, t.eventId, t.organizationId],
      foreignColumns: [form.id, form.eventId, form.organizationId],
    }),
    foreignKey({
      columns: [t.submissionId, t.formId, t.organizationId],
      foreignColumns: [
        formSubmission.id,
        formSubmission.formId,
        formSubmission.organizationId,
      ],
    }),
    uniqueIndex("registration_active_person")
      .on(t.eventId, t.userId)
      .where(sql`${t.status} = 'confirmed'`),
    index("registration_user").on(t.userId, t.createdAt),
    check(
      "registration_status",
      sql`(${t.status} = 'confirmed' and ${t.cancelledAt} is null) or (${t.status} = 'cancelled' and ${t.cancelledAt} is not null)`,
    ),
  ],
);
