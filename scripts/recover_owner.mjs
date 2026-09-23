import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";
import { assertLocalDatabase, local, readEnv, reportFailure, writePrivate } from "./local_common.mjs";

const emailIndex = process.argv.indexOf("--email");
const nominatedEmail = process.argv[emailIndex + 1]?.trim().toLowerCase();

try {
  if (emailIndex < 0 || !nominatedEmail || !/^[^\s@]+@[^\s@]+\.test$/u.test(nominatedEmail)) {
    throw new Error("Use pnpm recover:owner --email nominated-owner@example.test for an existing local approved owner.");
  }
  const { MIGRATION_DATABASE_URL } = readEnv(resolve(local, "migration.env"));
  assertLocalDatabase(MIGRATION_DATABASE_URL, ["rotapress"]);
  const client = new pg.Client({ connectionString: MIGRATION_DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    const identity = await client.query(`SELECT m.organization_id, m.user_id
      FROM club.membership m JOIN club.user u ON u.id = m.user_id
      WHERE lower(u.email) = $1 AND u.email_verified = true
        AND m.status = 'approved' AND m.role = 'owner'`, [nominatedEmail]);
    if (identity.rowCount !== 1) throw new Error("Recovery requires exactly one verified, approved existing owner; no identities or permissions have been changed.");
    const owner = identity.rows[0];
    await client.query("SELECT id FROM club.organization WHERE id = $1 FOR UPDATE", [owner.organization_id]);
    const membership = await client.query(`SELECT 1 FROM club.membership
      WHERE organization_id = $1 AND user_id = $2 AND status = 'approved' AND role = 'owner'`,
    [owner.organization_id, owner.user_id]);
    if (membership.rowCount !== 1) throw new Error("Owner membership changed; recovery was not issued.");
    const claim = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(claim).digest("hex");
    await client.query("UPDATE club.owner_recovery SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [owner.user_id]);
    const recovery = await client.query(`INSERT INTO club.owner_recovery
      (organization_id, user_id, nominated_email, claim_hash, expires_at)
      VALUES ($1, $2, $3, $4, now() + interval '15 minutes') RETURNING id`,
    [owner.organization_id, owner.user_id, nominatedEmail, hash]);
    await client.query("DELETE FROM club.session WHERE user_id = $1", [owner.user_id]);
    await client.query(`INSERT INTO club.audit_entry (organization_id, actor_user_id, action, target_id)
      VALUES ($1, $2, 'owner.recovery.requested', $3)`,
    [owner.organization_id, owner.user_id, recovery.rows[0].id]);
    await client.query("COMMIT");
    writePrivate(resolve(local, "recovery-claim.txt"), `${claim}\n`);
    writePrivate(resolve(local, "recovery-info.json"), `${JSON.stringify({
      ownerEmail: nominatedEmail, recoveryUrl: "http://127.0.0.1:3000/recovery", expiresInMinutes: 15,
    }, null, 2)}\n`);
    console.log("Owner sessions revoked and recovery request audited. Sign in again, open /recovery and paste the private .local/recovery-claim.txt value within 15 minutes.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
} catch (error) {
  reportFailure(error);
}
