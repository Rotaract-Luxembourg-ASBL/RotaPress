import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { club } from "./club";
import { clubEvent } from "./events";
import { eventRegistration } from "./registrations";
import { lumaGuestProjection } from "./luma-sync";
import { user } from "./auth";

export const guestAccess = club.table(
  "guest_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    eventId: uuid("event_id").notNull(),
    registrationId: uuid("registration_id"),
    registrationUserId: text("registration_user_id"),
    lumaGuestId: uuid("luma_guest_id"),
    recipientEmail: text("recipient_email").notNull(),
    claimedBy: text("claimed_by").references(() => user.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    foreignKey({
      name: "guest_access_event_scope",
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    foreignKey({
      name: "guest_access_registration_scope",
      columns: [
        t.registrationId,
        t.eventId,
        t.organizationId,
        t.registrationUserId,
      ],
      foreignColumns: [
        eventRegistration.id,
        eventRegistration.eventId,
        eventRegistration.organizationId,
        eventRegistration.userId,
      ],
    }),
    foreignKey({
      name: "guest_access_provider_scope",
      columns: [t.lumaGuestId, t.eventId, t.organizationId],
      foreignColumns: [
        lumaGuestProjection.id,
        lumaGuestProjection.eventId,
        lumaGuestProjection.organizationId,
      ],
    }),
    check(
      "guest_access_source",
      sql`(${t.registrationId} is not null and ${t.registrationUserId} is not null and ${t.lumaGuestId} is null) or (${t.registrationId} is null and ${t.registrationUserId} is null and ${t.lumaGuestId} is not null)`,
    ),
    check(
      "guest_access_claim",
      sql`(${t.claimedBy} is null) = (${t.claimedAt} is null)`,
    ),
    check(
      "guest_access_native_identity",
      sql`${t.registrationUserId} is null or ${t.claimedBy} is null or ${t.registrationUserId} = ${t.claimedBy}`,
    ),
    check(
      "guest_access_email",
      sql`${t.recipientEmail} = lower(trim(${t.recipientEmail})) and length(${t.recipientEmail}) between 3 and 254`,
    ),
    check("guest_access_version", sql`${t.version} > 0`),
    uniqueIndex("guest_access_native_active")
      .on(t.registrationId)
      .where(sql`${t.revokedAt} is null`),
    uniqueIndex("guest_access_provider_active")
      .on(t.lumaGuestId)
      .where(sql`${t.revokedAt} is null`),
    index("guest_access_event_history").on(t.eventId, t.createdAt),
    index("guest_access_recipient").on(t.organizationId, t.recipientEmail),
    index("guest_access_claimed_by").on(t.claimedBy),
    index("guest_access_created_by").on(t.createdBy),
    index("guest_access_native_history").on(t.registrationId),
    index("guest_access_provider_history").on(t.lumaGuestId),
  ],
);
