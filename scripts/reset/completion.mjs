import { resolve } from "node:path";
import { prepareQuarantine, quarantineFiles } from "./backup.mjs";
import { assertPaused, inventory, same } from "./inventory.mjs";
import { clearedTables, reviewedTables, tableSql } from "./tables.mjs";
import { assertGeneration, readJson, writeJson } from "./files.mjs";

export async function prepareCompletion(root, backup, target, generation) {
  await prepareQuarantine(root, generation);
  const receipt = {
    format: "rotapress-reset-completion",
    version: 1,
    target,
    generation,
    createdAt: new Date().toISOString(),
    manifestFingerprint: backup.manifestFingerprint,
    sourceFingerprint: backup.manifest.source.dataFingerprint,
    protectedFingerprint: backup.manifest.source.protectedFingerprint,
    schemaFingerprint: backup.manifest.source.schemaFingerprint,
    organizationId: backup.manifest.source.organizationId,
    ownerIds: backup.manifest.source.ownerIds,
    quarantineComplete: false,
  };
  await writeJson(resolve(backup.root, `reset-${generation}.json`), receipt);
  return receipt;
}

export async function readCompletion(backup, target, generation) {
  assertGeneration(generation);
  const receipt = await readJson(
    resolve(backup.root, `reset-${generation}.json`),
  );
  if (
    !receipt ||
    receipt.format !== "rotapress-reset-completion" ||
    receipt.version !== 1 ||
    receipt.target !== target ||
    receipt.generation !== generation ||
    receipt.manifestFingerprint !== backup.manifestFingerprint ||
    receipt.sourceFingerprint !== backup.manifest.source.dataFingerprint ||
    receipt.protectedFingerprint !==
      backup.manifest.source.protectedFingerprint ||
    receipt.schemaFingerprint !== backup.manifest.source.schemaFingerprint ||
    receipt.organizationId !== backup.manifest.source.organizationId ||
    !same(receipt.ownerIds, backup.manifest.source.ownerIds)
  )
    throw new Error("RESET_COMPLETION_MISMATCH");
  return receipt;
}

async function verifyCompletion(client, receipt) {
  const current = await inventory(client);
  const {
    rows: [state],
  } = await client.query(
    "SELECT generation,reset_at FROM club.content_generation WHERE organization_id=$1",
    [receipt.organizationId],
  );
  const {
    rows: [retainedResults],
  } = await client.query(
    "SELECT EXISTS (SELECT 1 FROM club.automation_receipt WHERE result IS NOT NULL OR task_id IS NOT NULL) AS found",
  );
  const {
    rows: [audit],
  } = await client.query(
    "SELECT count(*)::int AS count FROM club.audit_entry WHERE organization_id=$1 AND action='installation.content_reset' AND target_id=$2",
    [receipt.organizationId, receipt.generation],
  );
  if (
    state?.generation !== receipt.generation ||
    !state.reset_at ||
    retainedResults.found ||
    audit.count !== 1 ||
    current.organizationId !== receipt.organizationId ||
    current.protectedFingerprint !== receipt.protectedFingerprint ||
    current.schemaFingerprint !== receipt.schemaFingerprint ||
    !same(current.ownerIds, receipt.ownerIds) ||
    current.counts.membership !== receipt.ownerIds.length ||
    clearedTables.some(
      (name) => current.counts[name] !== (name === "audit_entry" ? 1 : 0),
    )
  )
    throw new Error("RESET_COMPLETION_STATE_CHANGED");
}

export async function finishCompletion(client, root, backup, receipt) {
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SELECT pg_advisory_xact_lock(173924, 2)");
    await assertPaused(client);
    // Hold checked state through file completion if a stopped writer restarts.
    // SHARE locks allow inspection but prevent mutations and schema changes.
    await client.query(
      `LOCK TABLE ${reviewedTables.map(tableSql).join(", ")} IN SHARE MODE`,
    );
    await assertPaused(client);
    await verifyCompletion(client, receipt);
    const quarantine = await quarantineFiles(
      root,
      receipt.generation,
      backup.files["uploads.jsonl"],
    );
    const path = resolve(backup.root, `reset-${receipt.generation}.json`);
    await writeJson(
      path,
      {
        ...receipt,
        committed: true,
        quarantineComplete: true,
        quarantine,
        emptyContent: true,
        completedAt: new Date().toISOString(),
      },
      { replace: true },
    );
    await client.query("COMMIT");
    return {
      reset: true,
      receipt: path,
      protectedUnchanged: true,
      emptyContent: true,
      restartRequired: true,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
