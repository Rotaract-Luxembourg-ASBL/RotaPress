import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { mediaUploadSession } from "../../../db/schema/media-uploads";
import type { Database } from "@/infrastructure/database/client";
import type { LocalStorageDriver } from "@/infrastructure/storage/LocalStorageDriver";

type Chunks = typeof mediaUploadSession.$inferSelect.chunks;
const expiryBatch = 20;
const cleanupBatch = 10;
const chunkBatch = 13;

/** Keep hashes as idempotency receipts; only successfully removed staging keys disappear. */
export async function cleanupUploadChunks(
  input: Chunks,
  storage: Pick<LocalStorageDriver, "delete">,
  now: Date,
  limit: number,
) {
  const chunks = { ...input };
  let removed = 0,
    failed = 0,
    attempted = 0;
  for (const [index, chunk] of Object.entries(chunks)) {
    if (
      !chunk.key ||
      (chunk.retryAfter && chunk.retryAfter > now.toISOString())
    )
      continue;
    if (attempted >= limit) break;
    attempted++;
    try {
      await storage.delete(chunk.key);
      chunks[index] = { hash: chunk.hash };
      removed++;
    } catch {
      // A durable short backoff prevents a damaged file from starving other sessions.
      chunks[index] = {
        ...chunk,
        retryAfter: new Date(now.getTime() + 5 * 60_000).toISOString(),
      };
      failed++;
    }
  }
  return { chunks, removed, failed, attempted };
}

export class MediaUploadCleanup {
  constructor(
    private readonly db: Database,
    private readonly storage: LocalStorageDriver,
  ) {}

  async session(id: string) {
    return this.runCleanup(id);
  }

  private async runCleanup(id?: string) {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const pending = await tx
        .select({
          id: mediaUploadSession.id,
          chunks: mediaUploadSession.chunks,
        })
        .from(mediaUploadSession)
        .where(
          and(
            inArray(mediaUploadSession.status, ["cancelled", "complete"]),
            id ? eq(mediaUploadSession.id, id) : undefined,
            sql`exists (select 1 from jsonb_each(${mediaUploadSession.chunks}) as part
            where part.value ? 'key' and
              (part.value->>'retryAfter' is null or part.value->>'retryAfter' <= ${now.toISOString()}))`,
          ),
        )
        .orderBy(mediaUploadSession.expiresAt, mediaUploadSession.id)
        .limit(id ? 1 : cleanupBatch)
        .for("update", { skipLocked: true });
      let removed = 0,
        failed = 0;
      for (const session of pending) {
        const result = await cleanupUploadChunks(
          session.chunks,
          this.storage,
          now,
          id ? 125 : chunkBatch,
        );
        if (result.attempted)
          await tx
            .update(mediaUploadSession)
            .set({ chunks: result.chunks })
            .where(eq(mediaUploadSession.id, session.id));
        removed += result.removed;
        failed += result.failed;
      }
      return { removed, failed };
    });
  }

  async expire() {
    const expired = await this.db.transaction(async (tx) => {
      const pending = await tx
        .select({ id: mediaUploadSession.id })
        .from(mediaUploadSession)
        .where(
          and(
            eq(mediaUploadSession.status, "uploading"),
            lt(mediaUploadSession.expiresAt, new Date()),
          ),
        )
        .orderBy(mediaUploadSession.expiresAt, mediaUploadSession.id)
        .limit(expiryBatch)
        .for("update", { skipLocked: true });
      if (!pending.length) return 0;
      await tx
        .update(mediaUploadSession)
        .set({ status: "cancelled" })
        .where(
          inArray(
            mediaUploadSession.id,
            pending.map((session) => session.id),
          ),
        );
      return pending.length;
    });
    const cleanup = await this.runCleanup();
    const staged = await this.storage.purgeStaging(
      new Date(Date.now() - 25 * 60 * 60 * 1000),
    );
    return {
      expired,
      cleanedFiles: cleanup.removed,
      cleanupFailures: cleanup.failed + staged.failed,
      stagedFiles: staged.removed,
    };
  }
}
