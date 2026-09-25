import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "@/infrastructure/database/client";
import { DomainError } from "./authorization/AuthorizationService";

export class RequestLimiter {
  constructor(private readonly db: Database) {}

  async consume(
    scope: string,
    identity: string,
    max: number,
    windowSeconds = 60,
  ): Promise<void> {
    const key = `app:${scope}:${createHash("sha256").update(identity).digest("hex")}`;
    const now = Date.now();
    const cutoff = now - windowSeconds * 1000;
    const result = await this.db.execute<{ count: number }>(sql`
      INSERT INTO club.rate_limit (id, key, count, last_request)
      VALUES (${randomUUID()}, ${key}, 1, ${now})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN club.rate_limit.last_request < ${cutoff} THEN 1 ELSE club.rate_limit.count + 1 END,
        last_request = CASE WHEN club.rate_limit.last_request < ${cutoff} THEN ${now} ELSE club.rate_limit.last_request END
      RETURNING count
    `);
    if (result.rows[0].count > max) {
      throw new DomainError(
        "RATE_LIMITED",
        "Too many requests. Please wait a minute.",
        429,
      );
    }
  }
}
