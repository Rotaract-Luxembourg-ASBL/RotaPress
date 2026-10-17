import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export function assertGeneration(generation) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
      generation ?? "",
    )
  )
    throw new Error("RESET_GENERATION_INVALID");
}

export async function openRegularFile(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new Error("RESET_BACKUP_FILE_INVALID");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const opened = await handle.stat();
  if (
    !opened.isFile() ||
    opened.ino !== stat.ino ||
    opened.dev !== stat.dev ||
    opened.nlink !== 1
  ) {
    await handle.close();
    throw new Error("RESET_BACKUP_FILE_INVALID");
  }
  return handle;
}

export async function readJson(path) {
  const handle = await openRegularFile(path);
  try {
    if ((await handle.stat()).size > 1024 * 1024)
      throw new Error("RESET_MANIFEST_TOO_LARGE");
    return JSON.parse(await handle.readFile("utf8"));
  } finally {
    await handle.close();
  }
}

/** Keep a valid recovery receipt if the process stops during its final write. */
export async function writeJson(path, value, { replace = false } = {}) {
  const destination = replace
    ? resolve(dirname(path), `.reset-receipt-${randomUUID()}.tmp`)
    : path;
  const handle = await open(destination, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (!replace) return;
  try {
    const previous = await openRegularFile(path);
    await previous.close();
    await rename(destination, path);
  } catch (error) {
    await unlink(destination);
    throw error;
  }
}
