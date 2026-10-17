import { createHash } from "node:crypto";
import { preservedTables, reviewedTables, tableSql } from "./tables.mjs";

export const digest = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export const same = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);

async function rowsFingerprint(client, table, predicate = "true") {
  // Rows are hashed in process; authentication and participant values are never printed.
  const { rows } = await client.query(
    `SELECT to_jsonb(t)::text AS row FROM ${tableSql(table)} t WHERE ${predicate} ORDER BY to_jsonb(t)::text`,
  );
  return { count: rows.length, sha256: digest(rows.map((row) => row.row)) };
}

export async function assertPaused(client) {
  const {
    rows: [row],
  } = await client.query(
    "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND usename = 'rotapress_app'",
  );
  if (row.count !== 0) throw new Error("RESET_WRITES_NOT_STOPPED");
}

export async function inventory(client) {
  const { rows: tables } = await client.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema='club' AND table_type='BASE TABLE' ORDER BY table_name",
  );
  if (
    !same(
      tables.map((table) => table.name),
      reviewedTables,
    )
  )
    throw new Error("RESET_TABLE_REVIEW_REQUIRED");
  const { rows: installed } = await client.query(
    "SELECT organization_id AS id FROM club.installation WHERE id=1 AND completed_at IS NOT NULL",
  );
  if (installed.length !== 1 || !installed[0].id)
    throw new Error("RESET_INSTALLATION_REQUIRED");
  const organizationId = installed[0].id;
  const { rows: organizations } = await client.query(
    "SELECT id FROM club.organization",
  );
  if (organizations.length !== 1 || organizations[0].id !== organizationId)
    throw new Error("RESET_ORGANIZATION_MISMATCH");
  const { rows: owners } = await client.query(
    "SELECT m.user_id AS id FROM club.membership m JOIN club.\"user\" u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.status='approved' AND m.role='owner' AND u.email_verified=true ORDER BY m.user_id",
    [organizationId],
  );
  if (!owners.length) throw new Error("RESET_APPROVED_OWNER_REQUIRED");
  const ownerIds = owners.map((owner) => owner.id);
  const schema = [];
  for (const query of [
    "SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='club' ORDER BY table_name,ordinal_position",
    "SELECT c.relname,n.conname,pg_get_constraintdef(n.oid) AS definition FROM pg_constraint n JOIN pg_class c ON c.oid=n.conrelid JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='club' ORDER BY c.relname,n.conname",
    "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='club' ORDER BY tablename,indexname",
    "SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='club' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
    "SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='club' AND p.prokind IN ('f','p') ORDER BY p.proname,arguments",
    "SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace s ON s.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE s.nspname='club' ORDER BY t.typname,e.enumsortorder",
  ])
    schema.push((await client.query(query)).rows);
  const fingerprints = {};
  for (const table of reviewedTables)
    fingerprints[table] = await rowsFingerprint(client, table);
  const protectedRows = {};
  for (const table of preservedTables)
    protectedRows[table] = fingerprints[table];
  protectedRows.membership = await rowsFingerprint(
    client,
    "membership",
    "t.role='owner' AND t.status='approved'",
  );
  if (protectedRows.membership.count !== ownerIds.length)
    throw new Error("RESET_UNVERIFIED_OWNER");
  protectedRows.site_domain = await rowsFingerprint(
    client,
    "site_domain",
    "t.event_id IS NULL",
  );
  return {
    organizationId,
    ownerIds,
    schemaFingerprint: digest(schema),
    protectedFingerprint: digest(protectedRows),
    dataFingerprint: digest(fingerprints),
    protectedRows,
    counts: Object.fromEntries(
      Object.entries(fingerprints).map(([table, value]) => [
        table,
        value.count,
      ]),
    ),
  };
}

export function assertTarget(current, expected) {
  for (const key of [
    "organizationId",
    "schemaFingerprint",
    "protectedFingerprint",
    "dataFingerprint",
  ]) {
    if (current[key] !== expected[key])
      throw new Error(`RESET_${key.toUpperCase()}_MISMATCH`);
  }
  if (!same(current.ownerIds, expected.ownerIds))
    throw new Error("RESET_OWNER_MISMATCH");
}
