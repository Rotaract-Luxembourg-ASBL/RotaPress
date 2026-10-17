import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { backupUploads, restoreUploads } from "../hosting/upload-archive.mjs";
import { digest } from "./inventory.mjs";
import {
  assertGeneration,
  openRegularFile,
  readJson,
  writeJson,
} from "./files.mjs";

const allowedFiles = [
  "database.dump",
  "uploads.jsonl",
  "recovery.env",
  "database.env",
  "services.env",
];
const shaPattern = /^[a-f0-9]{64}$/u;
export async function fileHash(path) {
  const handle = await openRegularFile(path);
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false }))
      hash.update(chunk);
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}
export async function checkedBackup(folder) {
  const root = await realpath(folder);
  const manifest = await readJson(resolve(root, "manifest.json"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    manifest.version !== 1 ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files) ||
    !["database.dump", "uploads.jsonl", "recovery.env"].every(
      (name) => name in manifest.files,
    )
  )
    throw new Error("RESET_BACKUP_MANIFEST_INVALID");
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (
      !allowedFiles.includes(name) ||
      typeof hash !== "string" ||
      !shaPattern.test(hash) ||
      (await fileHash(resolve(root, name))) !== hash
    )
      throw new Error("RESET_BACKUP_CHECKSUM_INVALID");
  }
  return { root, files: manifest.files, fingerprint: digest(manifest.files) };
}
export async function sealBackup(folder, target, source) {
  const backup = await checkedBackup(folder);
  const manifest = {
    format: "rotapress-content-reset",
    version: 1,
    target,
    createdAt: new Date().toISOString(),
    backupFingerprint: backup.fingerprint,
    source,
  };
  await writeJson(resolve(backup.root, "reset-manifest.json"), manifest);
  return manifest;
}
export async function resetBackup(folder, target) {
  const backup = await checkedBackup(folder);
  const manifest = await readJson(resolve(backup.root, "reset-manifest.json"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.format !== "rotapress-content-reset" ||
    manifest.version !== 1 ||
    manifest.target !== target ||
    manifest.backupFingerprint !== backup.fingerprint ||
    !manifest.source ||
    typeof manifest.source !== "object" ||
    !["schemaFingerprint", "protectedFingerprint", "dataFingerprint"].every(
      (name) => shaPattern.test(manifest.source[name] ?? ""),
    ) ||
    !Array.isArray(manifest.source.ownerIds) ||
    !manifest.source.ownerIds.length
  )
    throw new Error("RESET_MANIFEST_MISMATCH");
  return { ...backup, manifest, manifestFingerprint: digest(manifest) };
}
export async function rehearseFiles(folder, destination) {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const stat = await lstat(destination);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (await readdir(destination)).length
  )
    throw new Error("RESET_REHEARSAL_FILES_NOT_EMPTY");
  const archive = await openRegularFile(resolve(folder, "uploads.jsonl"));
  try {
    await restoreUploads(
      destination,
      archive.createReadStream({ autoClose: false }),
    );
  } finally {
    await archive.close();
  }
  return (await readdir(destination)).length;
}
export async function checkCurrentFiles(uploads, expectedHash) {
  const hash = createHash("sha256");
  let names;
  try {
    const stat = await lstat(uploads);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("RESET_UPLOAD_PATH_INVALID");
    names = await readdir(uploads);
  } catch (error) {
    if (error.code === "ENOENT") names = [];
    else throw error;
  }
  await backupUploads(uploads, names, async (line) => {
    hash.update(`${JSON.stringify(line)}\n`);
  });
  if (hash.digest("hex") !== expectedHash)
    throw new Error("RESET_UPLOADS_CHANGED_SINCE_BACKUP");
}
export async function prepareQuarantine(root, generation) {
  assertGeneration(generation);
  const applicationRoot = await realpath(root);
  const dataRoot = resolve(applicationRoot, ".data");
  const source = resolve(dataRoot, "uploads");
  const target = resolve(dataRoot, "quarantine", `content-reset-${generation}`);
  const child = relative(dataRoot, target);
  if (!child || child.startsWith("..") || isAbsolute(child))
    throw new Error("RESET_QUARANTINE_PATH_INVALID");
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  if ((await lstat(dataRoot)).isSymbolicLink())
    throw new Error("RESET_UPLOAD_PATH_INVALID");
  await mkdir(resolve(dataRoot, "quarantine"), {
    recursive: true,
    mode: 0o700,
  });
  if ((await lstat(resolve(dataRoot, "quarantine"))).isSymbolicLink())
    throw new Error("RESET_QUARANTINE_PATH_INVALID");
  const probe = resolve(dataRoot, "quarantine", `.write-test-${generation}`);
  await writeFile(probe, "", { flag: "wx", mode: 0o600 });
  await unlink(probe);
  return { source, target };
}

export async function quarantineFiles(root, generation, expectedHash) {
  const { source, target } = await prepareQuarantine(root, generation);
  let existing = false;
  try {
    const stat = await lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("RESET_QUARANTINE_PATH_INVALID");
    existing = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing) {
    await checkCurrentFiles(target, expectedHash);
    // Resuming after a successful rename must never move new or unrelated files.
    try {
      const stat = await lstat(source);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (await readdir(source)).length
      )
        throw new Error("RESET_UPLOADS_CHANGED_SINCE_BACKUP");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await mkdir(source, { recursive: true, mode: 0o700 });
    return target;
  }
  await checkCurrentFiles(source, expectedHash);
  // Create a missing, verified-empty source before renaming. Never interpret a
  // failed rename as proof that the source was empty or successfully moved.
  await mkdir(source, { recursive: true, mode: 0o700 });
  if ((await lstat(source)).isSymbolicLink())
    throw new Error("RESET_UPLOAD_PATH_INVALID");
  await rename(source, target);
  await mkdir(source, { recursive: true, mode: 0o700 });
  return target;
}
