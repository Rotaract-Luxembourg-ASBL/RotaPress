import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";

export interface StorageDriver {
  write(bytes: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const maximumStoredBytes = 5 * 1024 * 1024;
const validKey = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

/** Flat random keys and private directories; uploads never enter Next's web root. */
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;
  // Runtime uploads stay outside the application bundle and its file trace.
  private readonly projectRoot = path.resolve(/* turbopackIgnore: true */ process.cwd());

  constructor(root: string) {
    this.root = path.resolve(root);
    const permitted = [path.join(this.projectRoot, ".data", "uploads"), path.join(this.projectRoot, ".local", "test-uploads")];
    if (!permitted.some((parent) => this.root === parent || this.root.startsWith(parent + path.sep))) {
      throw new Error("Media storage must stay in this project's private upload directory.");
    }
  }

  private async directory(): Promise<void> {
    // Check every component, including an existing .data/.local directory. A
    // symlinked root alone must not make an escaped target appear trustworthy.
    let current = this.projectRoot;
    const projectStat = await lstat(current);
    if (projectStat.isSymbolicLink() || !projectStat.isDirectory()) throw new Error("Unsafe media directory.");
    for (const segment of path.relative(this.projectRoot, this.root).split(path.sep)) {
      current = path.join(current, segment);
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      }
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Unsafe media directory.");
    }
    if (path.resolve(await realpath(this.root)).toLowerCase() !== this.root.toLowerCase()) {
      throw new Error("Unsafe media directory.");
    }
  }

  private target(key: string): string {
    if (!validKey.test(key)) throw new Error("Invalid media storage key.");
    const target = path.resolve(this.root, key);
    if (path.dirname(target) !== this.root) throw new Error("Invalid media storage key.");
    return target;
  }

  async write(bytes: Buffer): Promise<string> {
    if (!bytes.length || bytes.length > maximumStoredBytes) throw new Error("Invalid stored media size.");
    await this.directory();
    const key = `${randomUUID()}.webp`;
    const handle = await open(this.target(key), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
    return key;
  }

  async read(key: string): Promise<Buffer> {
    const target = this.target(key);
    await this.directory();
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Unsafe media file.");
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1 || opened.size <= 0 || opened.size > maximumStoredBytes
        || opened.ino !== stat.ino || opened.dev !== stat.dev) throw new Error("Unsafe media file.");
      return await handle.readFile();
    } finally {
      await handle.close();
    }
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
}
