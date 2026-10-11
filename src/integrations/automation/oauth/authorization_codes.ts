import "server-only";
import { sql } from "drizzle-orm";
import { verification } from "../../../../db/schema/auth";
import type { Transaction } from "@/core/authorization/AuthorizationService";

/** Find only provider authorization-code IDs for this exact registered client.
 * The CASE protects non-JSON OTP/provider state without reading values into memory.
 * Call under the grant lock, then delete these IDs in the provider transaction. */
export async function oauthAuthorizationCodeIds(
  tx: Transaction,
  clientId: string,
) {
  const rows = await tx.select({ id: verification.id }).from(verification)
    .where(sql`
    CASE WHEN ${verification.value} IS JSON OBJECT THEN
      ${verification.value}::jsonb ->> 'type' = 'authorization_code'
      AND ${verification.value}::jsonb -> 'query' ->> 'client_id' = ${clientId}
    ELSE false END
  `);
  return rows.map((row) => row.id);
}
