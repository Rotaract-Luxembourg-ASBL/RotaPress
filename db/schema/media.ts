import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { club, organization } from "./club";

export const mediaAsset = club.table("media_asset", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id),
  storageKey: text("storage_key").notNull().unique(),
  storageDriver: text("storage_driver").notNull().default("local"),
  visibility: text("visibility", { enum: ["private", "public"] }).notNull().default("private"),
  uploaderId: text("uploader_id").notNull().references(() => user.id),
  mimeType: text("mime_type").notNull().default("image/webp"),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  title: text("title").notNull().default(""),
  alt: text("alt").notNull().default(""),
  caption: text("caption").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  collection: text("collection").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("media_asset_scope").on(table.id, table.organizationId),
  index("media_asset_organization_created").on(table.organizationId, table.createdAt),
  check("media_asset_visibility", sql`${table.visibility} in ('private', 'public')`),
  check("media_asset_driver", sql`${table.storageDriver} = 'local'`),
  check("media_asset_mime", sql`${table.mimeType} = 'image/webp'`),
  check("media_asset_size", sql`${table.size} > 0 and ${table.size} <= 5242880`),
  check("media_asset_pixels", sql`${table.width} > 0 and ${table.height} > 0 and ${table.width}::bigint * ${table.height} <= 20000000`),
]);

// Immutable revision references preserve restore integrity. Active publication
// references additionally prevent making an in-use public image private.
export const mediaUsage = club.table("media_usage", {
  organizationId: uuid("organization_id").notNull().references(() => organization.id),
  ownerKey: text("owner_key").notNull(),
  assetId: uuid("asset_id").notNull(),
  published: boolean("published").notNull().default(false),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.ownerKey, table.assetId] }),
  foreignKey({ columns: [table.assetId, table.organizationId], foreignColumns: [mediaAsset.id, mediaAsset.organizationId] }),
  index("media_usage_asset").on(table.organizationId, table.assetId),
]);
