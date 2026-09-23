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
import { club } from "./club";
import { clubEvent } from "./events";
import { user } from "./auth";

export const eventPackageSource = club.table(
  "event_package_source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    unique("package_source_scope").on(t.id, t.eventId, t.organizationId),
    unique("package_source_url").on(t.eventId, t.url),
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    check("package_source_version", sql`${t.version} > 0`),
    check("package_source_label", sql`length(${t.label}) between 1 and 120`),
    check(
      "package_source_url_format",
      sql`${t.url} ~ '^https://luma[.]com/[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'`,
    ),
  ],
);

export const eventPackage = club.table(
  "event_package",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    draft: jsonb("draft").notNull(),
    sourceId: uuid("source_id"),
    version: integer("version").notNull().default(1),
    publishedRevisionId: uuid("published_revision_id"),
  },
  (t) => [
    unique("package_scope").on(t.id, t.eventId, t.organizationId),
    index("package_event").on(t.eventId),
    index("package_source").on(t.sourceId),
    foreignKey({
      columns: [t.eventId, t.organizationId],
      foreignColumns: [clubEvent.id, clubEvent.organizationId],
    }),
    foreignKey({
      columns: [t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        eventPackageSource.id,
        eventPackageSource.eventId,
        eventPackageSource.organizationId,
      ],
    }),
    check("package_version", sql`${t.version} > 0`),
  ],
);

export const eventPackageRevision = club.table(
  "event_package_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packageId: uuid("package_id").notNull(),
    eventId: uuid("event_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    sourceId: uuid("source_id"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("package_revision_scope").on(
      t.id,
      t.packageId,
      t.eventId,
      t.organizationId,
    ),
    index("package_revision_history").on(t.packageId, t.createdAt),
    index("package_revision_source").on(t.sourceId),
    foreignKey({
      columns: [t.packageId, t.eventId, t.organizationId],
      foreignColumns: [
        eventPackage.id,
        eventPackage.eventId,
        eventPackage.organizationId,
      ],
    }),
    foreignKey({
      columns: [t.sourceId, t.eventId, t.organizationId],
      foreignColumns: [
        eventPackageSource.id,
        eventPackageSource.eventId,
        eventPackageSource.organizationId,
      ],
    }),
  ],
);
// The composite publication pointer and immutable-row triggers follow table creation in SQL.
