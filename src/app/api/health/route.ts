import { sql } from "drizzle-orm";
import { db } from "@/infrastructure/database/client";
import { json } from "@/core/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return json({ status: "ok", application: "RotaPress" });
  } catch { return json({ status: "unavailable" }, 503); }
}
