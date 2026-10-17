import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { club, organization } from "./club";

export const mediaAlbum = club.table(
  "media_album",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    draftRevisionId: uuid("draft_revision_id"),
    publishedRevisionId: uuid("published_revision_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("media_album_scope").on(table.id, table.organizationId),
    index("media_album_updated").on(table.organizationId, table.updatedAt),
    check("media_album_version_positive", sql`${table.version} > 0`),
  ],
);

export const mediaAlbumRevision = club.table(
  "media_album_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    albumId: uuid("album_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    data: jsonb("data").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("media_album_revision_scope").on(
      table.id,
      table.albumId,
      table.organizationId,
    ),
    foreignKey({
      columns: [table.albumId, table.organizationId],
      foreignColumns: [mediaAlbum.id, mediaAlbum.organizationId],
    }).onDelete("cascade"),
    index("media_album_revision_created").on(table.albumId, table.createdAt),
  ],
);

// Reviewed migration installs draft/live pointer FKs after both tables exist.
export const mediaAlbumUsage = club.table(
  "media_album_usage",
  {
    organizationId: uuid("organization_id").notNull(),
    ownerKey: text("owner_key").notNull(),
    albumId: uuid("album_id").notNull(),
    published: boolean("published").notNull().default(false),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.ownerKey, table.albumId],
    }),
    foreignKey({
      columns: [table.albumId, table.organizationId],
      foreignColumns: [mediaAlbum.id, mediaAlbum.organizationId],
    }),
    index("media_album_usage_album").on(table.organizationId, table.albumId),
  ],
);
