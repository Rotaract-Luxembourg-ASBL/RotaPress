import { randomUUID } from "node:crypto";
import { clearedTables, reviewedTables, tableSql } from "./tables.mjs";
import { assertPaused, assertTarget, inventory } from "./inventory.mjs";
import { assertGeneration } from "./files.mjs";

/** Caller must verify the backup and isolated rehearsal before choosing commit. */
export async function resetTransaction(
  client,
  expected,
  { commit = false, requirePaused = true, generation = randomUUID() } = {},
) {
  assertGeneration(generation);
  // READ COMMITTED is intentional. An advisory-lock SELECT under SERIALIZABLE
  // would freeze the snapshot before table locks, hiding writes that committed
  // while those locks were being acquired. Exclusive table locks serialize the
  // inventory, reset and protected-state verification against every writer.
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(173924, 2)");
    if (requirePaused) await assertPaused(client);
    // Lock protected rows too: the final fingerprint must not race a login or provider update.
    await client.query(
      `LOCK TABLE ${reviewedTables.map(tableSql).join(", ")} IN ACCESS EXCLUSIVE MODE`,
    );
    if (requirePaused) await assertPaused(client);
    const before = await inventory(client);
    assertTarget(before, expected);
    const { rows: foreignKeys } = await client.query(
      "SELECT source.relname AS source,target.relname AS target FROM pg_constraint c JOIN pg_class source ON source.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=source.relnamespace JOIN pg_class target ON target.oid=c.confrelid WHERE c.contype='f' AND ns.nspname='club'",
    );
    const truncations = [...clearedTables, "site_domain"];
    const targets = new Set(truncations);
    if (
      foreignKeys.some(
        (key) => targets.has(key.target) && !targets.has(key.source),
      )
    )
      throw new Error("RESET_RESTRICTIVE_FOREIGN_KEY");
    await client.query(
      "CREATE TEMP TABLE retained_domains ON COMMIT DROP AS SELECT * FROM club.site_domain WHERE event_id IS NULL",
    );
    // RESTRICT fails closed. No schema drops, CASCADE, disabled constraints or disabled triggers.
    await client.query(
      `TRUNCATE TABLE ${truncations.map(tableSql).join(", ")} RESTRICT`,
    );
    await client.query(
      "INSERT INTO club.site_domain SELECT * FROM retained_domains",
    );
    await client.query(
      "DELETE FROM club.membership WHERE NOT (role='owner' AND status='approved')",
    );
    await client.query(
      "UPDATE club.automation_receipt SET result=NULL, task_id=NULL",
    );
    await client.query(
      "UPDATE club.content_generation SET generation=$1,reset_at=now() WHERE organization_id=$2",
      [generation, before.organizationId],
    );
    const after = await inventory(client);
    if (after.protectedFingerprint !== before.protectedFingerprint)
      throw new Error("RESET_PROTECTED_STATE_CHANGED");
    for (const table of clearedTables)
      if (after.counts[table] !== 0) throw new Error("RESET_CONTENT_NOT_EMPTY");
    if (after.counts.membership !== before.ownerIds.length)
      throw new Error("RESET_MEMBERSHIP_NOT_EMPTY");
    await client.query(
      "INSERT INTO club.audit_entry (organization_id,actor_user_id,action,target_id) VALUES ($1,$2,'installation.content_reset',$3)",
      [before.organizationId, before.ownerIds[0], generation],
    );
    await client.query(commit ? "COMMIT" : "ROLLBACK");
    return {
      committed: commit,
      generation,
      organizationId: before.organizationId,
      ownerIds: before.ownerIds,
      protectedFingerprint: after.protectedFingerprint,
      schemaFingerprint: after.schemaFingerprint,
      emptyContent: true,
      sourceFingerprint: before.dataFingerprint,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
