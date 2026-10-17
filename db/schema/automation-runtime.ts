import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { club, organization } from "./club";
import { user } from "./auth";

/** Exact operation receipts, not executable jobs. Reset clears results and retains retry tombstones. */
export const automationReceipt = club.table(
  "automation_receipt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    connectionId: text("connection_id").notNull(),
    requestId: uuid("request_id").notNull(),
    taskId: uuid("task_id"),
    generation: uuid("generation").notNull(),
    operation: text("operation").notNull(),
    inputHash: text("input_hash").notNull(),
    result: jsonb("result").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("automation_receipt_request").on(
      t.organizationId,
      t.actorUserId,
      t.requestId,
    ),
    index("automation_receipt_task").on(
      t.organizationId,
      t.actorUserId,
      t.taskId,
    ),
    check("automation_receipt_hash", sql`${t.inputHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

/** Private short-lived CSV snapshots, never public files or bearer links. */
export const automationExport = club.table(
  "automation_export",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    connectionId: text("connection_id").notNull(),
    generation: uuid("generation").notNull(),
    formId: uuid("form_id").notNull(),
    data: text("data").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("automation_export_expiry").on(t.expiresAt),
    check(
      "automation_export_size",
      sql`${t.size} >= 0 and ${t.size} <= 10485760`,
    ),
    check("automation_export_hash", sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  ],
);
