import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, opendir, realpath, rename, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export type StorageExtension = "webp" | "pdf" | "mp3" | "m4a" | "mp4" | "webm" | "part" | "pending";
export interface StorageDriver {
  write(bytes: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  stream?(key: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>>;
}
export const storedFileLimits = { webp: 5, pdf: 25, mp3: 100, m4a: 100, mp4: 500, webm: 500, part: 4, pending: 500 } as const;
const validKey = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|pdf|mp3|m4a|mp4|webm|part|pending)$/;
const fileLimit = (key: string) => storedFileLimits[key.split(".").at(-1) as StorageExtension] * 1024 * 1024;

/** Flat random keys and private directories; staged files never enter Next's web root. */
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;
  private readonly projectRoot = path.resolve(/* turbopackIgnore: true */ process.cwd());
  constructor(root: string) {
    this.root = path.resolve(root);
    const permitted = [path.join(this.projectRoot, ".data", "uploads"), path.join(this.projectRoot, ".local", "test-uploads")];
    if (!permitted.some((parent) => this.root === parent || this.root.startsWith(parent + path.sep))) {
      throw new Error("Media storage must stay in this project's private upload directory.");
    }
  }
  private async directory(): Promise<void> {
    let current = this.projectRoot;
    const projectStat = await lstat(current);
    if (projectStat.isSymbolicLink() || !projectStat.isDirectory()) throw new Error("Unsafe media directory.");
    for (const segment of path.relative(this.projectRoot, this.root).split(path.sep)) {
      current = path.join(current, segment);
      try { await mkdir(current, { mode: 0o700 }); }
      catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      }
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Unsafe media directory.");
    }
    if (path.resolve(await realpath(this.root)).toLowerCase() !== this.root.toLowerCase()) throw new Error("Unsafe media directory.");
  }
  private target(key: string): string {
    if (!validKey.test(key)) throw new Error("Invalid media storage key.");
    const target = path.resolve(this.root, key);
    if (path.dirname(target) !== this.root) throw new Error("Invalid media storage key.");
    return target;
  }
  private async opened(key: string): Promise<FileHandle> {
    const target = this.target(key);
    await this.directory();
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Unsafe media file.");
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.size <= 0 || opened.size > fileLimit(key)
      || opened.ino !== stat.ino || opened.dev !== stat.dev) {
      await handle.close();
      throw new Error("Unsafe media file.");
    }
    return handle;
  }
  async write(bytes: Buffer, extension: StorageExtension = "webp"): Promise<string> {
    const key = `${randomUUID()}.${extension}`;
    if (!bytes.length || bytes.length > fileLimit(key)) throw new Error("Invalid stored media size.");
    await this.directory();
    const handle = await open(this.target(key), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await handle.writeFile(bytes); }
    finally { await handle.close(); }
    return key;
  }
  async read(key: string): Promise<Buffer> {
    const handle = await this.opened(key);
    try {
      if ((await handle.stat()).size > 25 * 1024 * 1024) throw new Error("Use streaming delivery for large media.");
      return await handle.readFile();
    } finally { await handle.close(); }
  }
  async stream(key: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>> {
    const handle = await this.opened(key);
    const stat = await handle.stat();
    if (range && (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
      || range.start < 0 || range.end < range.start || range.end >= stat.size)) {
      await handle.close();
      throw new Error("Invalid file range.");
    }
    return Readable.toWeb(handle.createReadStream({ ...range, autoClose: true, highWaterMark: 64 * 1024 })) as ReadableStream<Uint8Array>;
  }
  /** Copy bounded chunks in order without collecting a video in server memory. */
  async assemble(keys: string[], size: number): Promise<string> {
    if (!Number.isInteger(size) || size <= 0 || size > 500 * 1024 * 1024 || !keys.length || keys.length > 125) throw new Error("Invalid staged media.");
    await this.directory();
    const key = `${randomUUID()}.pending`;
    const handle = await open(this.target(key), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    let total = 0;
    try {
      for (const chunk of keys) {
        if (!chunk.endsWith(".part")) throw new Error("Invalid staged media.");
        const bytes = await this.read(chunk);
        total += bytes.length;
        if (total > size) throw new Error("Invalid staged media size.");
        await handle.writeFile(bytes);
      }
      if (total !== size) throw new Error("Incomplete staged media.");
      await handle.sync();
    } catch (error) {
      await handle.close();
      await this.delete(key);
      throw error;
    }
    await handle.close();
    return key;
  }
  /** Only the parser worker receives this checked path, never an HTTP response. */
  async inspectionPath(key: string): Promise<string> {
    if (!key.endsWith(".pending")) throw new Error("Only staged files can be inspected.");
    const handle = await this.opened(key);
    await handle.close();
    return this.target(key);
  }
  async finalize(key: string, extension: Exclude<StorageExtension, "part" | "pending">): Promise<string> {
    if (!key.endsWith(".pending")) throw new Error("Invalid staged media.");
    const handle = await this.opened(key);
    const size = (await handle.stat()).size;
    await handle.close();
    const final = `${randomUUID()}.${extension}`;
    if (size > fileLimit(final)) throw new Error("Invalid stored media size.");
    await rename(this.target(key), this.target(final));
    return final;
  }
  async delete(key: string): Promise<void> {
    const target = this.target(key);
    await this.directory();
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Unsafe media file.");
      await unlink(target);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  /** Failed/crashed requests can leave only inaccessible staging bytes, never live assets. */
  async purgeStaging(before: Date): Promise<{ removed: number; failed: number }> {
    await this.directory();
    let removed = 0, failed = 0;
    const entries = await opendir(this.root);
    for await (const entry of entries) {
      if (!validKey.test(entry.name) || !/\.(part|pending)$/u.test(entry.name)) continue;
      try {
        const stat = await lstat(this.target(entry.name));
        if (stat.mtime < before) { await this.delete(entry.name); removed++; }
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) failed++;
      }
      if (removed + failed >= 1000) break;
    }
    return { removed, failed };
  }
}
