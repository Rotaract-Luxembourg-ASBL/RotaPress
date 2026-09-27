import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/infrastructure/database/client";
import type { Transaction } from "@/core/authorization/AuthorizationService";
import { config } from "@/core/config";
import { DomainError } from "@/core/DomainError";

/** Reserve one pooled connection while provider writes use another. Never hold
 * row locks across provider calls; try-locks avoid exhausting the connection pool. */
export function withOAuthGrantLock<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ acquired: boolean }>(sql`
      SELECT pg_try_advisory_xact_lock(hashtextextended(
        ${`oauth-consent:${config.APP_URL}`}, 0
      )) AS acquired
    `);
    if (!locked.rows[0]?.acquired)
      throw new DomainError(
        "OAUTH_CONSENT_BUSY",
        "Another connection change is being saved. Try again.",
        409,
      );
    return work(tx);
  });
}
