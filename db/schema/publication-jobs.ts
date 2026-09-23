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
import { user } from "./auth";
import { cmsContent, cmsRevision, cmsVariant } from "./cms";

/** Purpose-specific durable publication jobs; no arbitrary executable payload. */
export const cmsPublicationJob = club.table(
  "cms_publication_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    contentId: uuid("content_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    publicationVersion: integer("publication_version").notNull(),
    requestId: uuid("request_id").notNull(),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    // Session ID only. No bearer token; keep the receipt after library revocation.
    sessionId: text("session_id").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status", {
      enum: ["pending", "processing", "succeeded", "cancelled", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    errorCode: text("error_code"),
  },
  (t) => [
    foreignKey({
      columns: [t.contentId, t.organizationId],
      foreignColumns: [cmsContent.id, cmsContent.organizationId],
    }),
    foreignKey({
      columns: [t.variantId, t.contentId, t.organizationId],
      foreignColumns: [
        cmsVariant.id,
        cmsVariant.contentId,
        cmsVariant.organizationId,
      ],
    }),
    foreignKey({
      columns: [t.revisionId, t.variantId],
      foreignColumns: [cmsRevision.id, cmsRevision.variantId],
    }),
    unique("cms_publication_request").on(t.organizationId, t.requestId),
    uniqueIndex("cms_publication_active")
      .on(t.variantId)
      .where(sql`${t.status} in ('pending', 'processing')`),
    index("cms_publication_due")
      .on(t.availableAt)
      .where(sql`${t.status} in ('pending', 'processing')`),
    index("cms_publication_history").on(t.variantId, t.createdAt),
    check(
      "cms_publication_status",
      sql`${t.status} in ('pending', 'processing', 'succeeded', 'cancelled', 'failed')`,
    ),
    check("cms_publication_attempts", sql`${t.attempts} between 0 and 3`),
    check("cms_publication_version", sql`${t.publicationVersion} >= 0`),
    check(
      "cms_publication_lease",
      sql`(${t.status} = 'processing' and ${t.leaseToken} is not null and ${t.leaseExpiresAt} is not null) or (${t.status} <> 'processing' and ${t.leaseToken} is null and ${t.leaseExpiresAt} is null)`,
    ),
    check(
      "cms_publication_completion",
      sql`(${t.status} in ('pending', 'processing')) = (${t.finishedAt} is null)`,
    ),
  ],
);
