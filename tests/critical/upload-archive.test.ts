import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { backupUploads, restoreUploads } from "../../scripts/hosting/upload-archive.mjs";

const base = resolve(".local/test-uploads");
const root = resolve(base, `archive-${randomUUID()}`);
afterAll(async () => {
  if (dirname(root) !== base) throw new Error("Unsafe test cleanup");
  await rm(root, { recursive: true, force: true });
});
describe("streaming upload recovery archives", () => {
  it("round-trips every supported file and partial upload in bounded records", async () => {
    const source = resolve(root, "source"), target = resolve(root, "restored");
    await mkdir(source, { recursive: true }); await mkdir(target, { recursive: true });
    const extensions = ["webp", "pdf", "mp3", "m4a", "mp4", "webm", "part", "pending"];
    const keys = extensions.map((extension) => `${randomUUID()}.${extension}`);
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 13, 0x34);
    for (const key of keys) await writeFile(resolve(source, key), bytes);
    const lines: string[] = [];
    await backupUploads(source, keys, async (value: unknown) => { lines.push(JSON.stringify(value)); });
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(1.4 * 1024 * 1024);
    await restoreUploads(target, Readable.from([Buffer.from(lines.join("\n") + "\n")]));
    const digest = createHash("sha256").update(bytes).digest("hex");
    for (const key of keys) expect(createHash("sha256").update(await readFile(resolve(target, key))).digest("hex")).toBe(digest);
  });
  it("rejects reordered, corrupt, truncated archives and unsafe storage paths", async () => {
    const key = `${randomUUID()}.mp4`;
    const variants = [
      [{ start: "../escape.mp4", size: 1, version: 2 }],
      [{ start: key, size: 1, version: 2 }, { chunk: 1, data: "YQ==" }],
      [{ start: key, size: 1, version: 2 }, { chunk: 0, data: "YQ==" }, { end: key, chunks: 1, sha256: "0".repeat(64) }],
      [{ start: key, size: 1, version: 2 }, { complete: true, files: 1 }],
    ];
    for (let i = 0; i < variants.length; i++) {
      const target = resolve(root, `invalid-${i}`); await mkdir(target, { recursive: true });
      await expect(restoreUploads(target, Readable.from([Buffer.from(variants[i].map((value) => JSON.stringify(value)).join("\n") + "\n")]))).rejects.toThrow();
    }
  });
});
