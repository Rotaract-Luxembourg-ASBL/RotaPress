import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../db/schema";
import { config } from "@/core/config";

export type Database = NodePgDatabase<typeof schema>;
const globalDatabase = globalThis as typeof globalThis & { rotapressPool?: Pool };
export const pool = globalDatabase.rotapressPool ?? new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
if (!globalDatabase.rotapressPool) {
  pool.on("error", () => {
    console.error(JSON.stringify({ event: "database_connection_lost", code: "DATABASE_UNAVAILABLE" }));
  });
}
if (process.env.NODE_ENV !== "production") globalDatabase.rotapressPool = pool;
export const db: Database = drizzle(pool, { schema });
