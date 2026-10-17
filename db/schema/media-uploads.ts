import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { club, organization } from "./club";
import type { UploadSessionInput } from "../../src/features/media/upload_schemas";

/** Actor-bound receipts are retained after file deletion; a retry cannot recreate deleted media. */
export const mediaUploadSession = club.table("media_upload_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id),
  actorUserId: text("actor_user_id").notNull().references(() => user.id),
  requestId: uuid("request_id").notNull(),
  inputHash: text("input_hash").notNull(),
  input: jsonb("input").$type<UploadSessionInput>().notNull(),
  size: integer("size").notNull(),
  chunkSize: integer("chunk_size").notNull().default(4194304),
  chunks: jsonb("chunks").$type<Record<string, { key?: string; hash: string; retryAfter?: string }>>().notNull().default({}),
  status: text("status", { enum: ["uploading", "complete", "cancelled"] }).notNull().default("uploading"),
  assetId: uuid("asset_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("media_upload_request").on(table.organizationId, table.requestId),
  index("media_upload_expiry").on(table.expiresAt),
  check("media_upload_size", sql`${table.size} > 0 and ${table.size} <= 524288000`),
  check("media_upload_chunk_size", sql`${table.chunkSize} in (65536, 4194304)`),
  check("media_upload_hash", sql`${table.inputHash} ~ '^[a-f0-9]{64}$'`),
  check("media_upload_status", sql`${table.status} in ('uploading', 'complete', 'cancelled')`),
]);
