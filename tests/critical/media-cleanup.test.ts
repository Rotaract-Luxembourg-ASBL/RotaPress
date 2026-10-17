import { describe, expect, it, vi } from "vitest";
import { cleanupUploadChunks } from "../../src/features/media/MediaUploadCleanup";

describe("durable upload cleanup", () => {
  it("keeps failed keys with backoff, removes successful keys and preserves receipt hashes", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const input = {
      "0": { key: "failed.part", hash: "a" },
      "1": { key: "removed.part", hash: "b" },
    };
    const remove = vi.fn(async (key: string) => {
      if (key === "failed.part") throw new Error("Synthetic storage failure");
    });
    const result = await cleanupUploadChunks(
      input,
      { delete: remove },
      now,
      10,
    );
    expect(result).toEqual({
      attempted: 2,
      removed: 1,
      failed: 1,
      chunks: {
        "0": { ...input["0"], retryAfter: "2026-10-15T12:05:00.000Z" },
        "1": { hash: "b" },
      },
    });
    expect(input["1"].key).toBe("removed.part");
    remove.mockClear();
    const early = await cleanupUploadChunks(
      result.chunks,
      { delete: remove },
      now,
      10,
    );
    expect(early.attempted).toBe(0);
    expect(remove).not.toHaveBeenCalled();
    remove.mockResolvedValue(undefined);
    const retried = await cleanupUploadChunks(
      result.chunks,
      { delete: remove },
      new Date("2026-10-15T12:05:00Z"),
      10,
    );
    expect(retried.chunks).toEqual({ "0": { hash: "a" }, "1": { hash: "b" } });
    expect(retried).toMatchObject({ attempted: 1, removed: 1, failed: 0 });
  });

  it("bounds file attempts including failures and does not run deletion concurrently", async () => {
    let active = 0,
      peak = 0;
    const remove = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      throw new Error("Synthetic failure");
    });
    const chunks = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [
        String(index),
        { key: `${index}.part`, hash: String(index) },
      ]),
    );
    const result = await cleanupUploadChunks(
      chunks,
      { delete: remove },
      new Date(),
      13,
    );
    expect(result).toMatchObject({ attempted: 13, removed: 0, failed: 13 });
    expect(remove).toHaveBeenCalledTimes(13);
    expect(peak).toBe(1);
    expect(result.chunks["13"]).toEqual(chunks["13"]);
  });
});
