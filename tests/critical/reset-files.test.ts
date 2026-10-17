import { randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  readFile,
  readdir,
  rmdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { backupUploads } from "../../scripts/hosting/upload-archive.mjs";
import {
  checkedBackup,
  fileHash,
  prepareQuarantine,
  quarantineFiles,
  rehearseFiles,
  resetBackup,
  sealBackup,
} from "../../scripts/reset/backup.mjs";
import {
  prepareCompletion,
  readCompletion,
} from "../../scripts/reset/completion.mjs";
import { readJson, writeJson } from "../../scripts/reset/files.mjs";

const base = resolve(".local/test-uploads");
const root = resolve(base, `reset-review-${randomUUID()}`);
const target = "https://reset.example.test";
const source = {
  organizationId: randomUUID(),
  ownerIds: [randomUUID()],
  schemaFingerprint: "a".repeat(64),
  protectedFingerprint: "b".repeat(64),
  dataFingerprint: "c".repeat(64),
};

afterAll(async () => {
  if (dirname(root) !== base) throw new Error("Unsafe reset test cleanup");
  await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const application = resolve(root, randomUUID());
  const uploads = resolve(application, ".data/uploads");
  const backup = resolve(application, "backup");
  await mkdir(uploads, { recursive: true });
  await mkdir(backup);
  const keys = [`${randomUUID()}.pdf`, `${randomUUID()}.mp4`];
  for (const key of keys)
    await writeFile(resolve(uploads, key), `synthetic-${key}`);
  const lines: string[] = [];
  await backupUploads(uploads, keys, async (line: unknown) => {
    lines.push(JSON.stringify(line));
  });
  await writeFile(resolve(backup, "uploads.jsonl"), lines.join("\n") + "\n");
  await writeFile(resolve(backup, "database.dump"), "synthetic backup bytes");
  await writeFile(
    resolve(backup, "recovery.env"),
    "SYNTHETIC_CONFIGURATION=true\n",
  );
  const files = Object.fromEntries(
    await Promise.all(
      ["database.dump", "uploads.jsonl", "recovery.env"].map(async (name) => [
        name,
        await fileHash(resolve(backup, name)),
      ]),
    ),
  );
  await writeJson(resolve(backup, "manifest.json"), { version: 1, files });
  return { application, uploads, backup, files, keys };
}

describe("reset backup and resumable file completion", () => {
  it("binds verified artifacts to one source and restores the archived files", async () => {
    const f = await fixture();
    await sealBackup(f.backup, target, source);
    const backup = await resetBackup(f.backup, target);
    expect(backup.manifest.source).toEqual(source);
    await expect(
      resetBackup(f.backup, "https://other.example.test"),
    ).rejects.toThrow("RESET_MANIFEST_MISMATCH");
    const restored = resolve(f.application, "restored");
    expect(await rehearseFiles(f.backup, restored)).toBe(2);
    for (const key of f.keys) {
      expect(await fileHash(resolve(restored, key))).toBe(
        await fileHash(resolve(f.uploads, key)),
      );
    }
    await expect(rehearseFiles(f.backup, restored)).rejects.toThrow(
      "RESET_REHEARSAL_FILES_NOT_EMPTY",
    );
    await writeFile(resolve(f.backup, "database.dump"), "changed backup");
    await expect(checkedBackup(f.backup)).rejects.toThrow(
      "RESET_BACKUP_CHECKSUM_INVALID",
    );
  });

  it("resumes after a rename without deleting a file or moving newly uploaded content", async () => {
    const f = await fixture();
    const generation = randomUUID();
    const quarantined = await quarantineFiles(
      f.application,
      generation,
      f.files["uploads.jsonl"],
    );
    expect((await readdir(quarantined)).sort()).toEqual(f.keys.sort());
    expect(await readdir(f.uploads)).toEqual([]);
    await rmdir(f.uploads); // Simulate interruption between the rename and recreating uploads.
    expect(
      await quarantineFiles(
        f.application,
        generation,
        f.files["uploads.jsonl"],
      ),
    ).toBe(quarantined);
    const newKey = `${randomUUID()}.pdf`;
    await writeFile(resolve(f.uploads, newKey), "new upload remains untouched");
    await expect(
      quarantineFiles(f.application, generation, f.files["uploads.jsonl"]),
    ).rejects.toThrow("RESET_UPLOADS_CHANGED_SINCE_BACKUP");
    expect(await readFile(resolve(f.uploads, newKey), "utf8")).toBe(
      "new upload remains untouched",
    );
    expect((await readdir(quarantined)).sort()).toEqual(f.keys.sort());
  });

  it("refuses linked backup files and directory aliases before any move", async () => {
    const f = await fixture();
    await link(
      resolve(f.backup, "database.dump"),
      resolve(f.backup, "linked.dump"),
    );
    await expect(checkedBackup(f.backup)).rejects.toThrow(
      "RESET_BACKUP_FILE_INVALID",
    );
    const unsafe = resolve(root, randomUUID());
    await mkdir(unsafe);
    await symlink(
      resolve(f.application, ".data"),
      resolve(unsafe, ".data"),
      "junction",
    );
    await expect(prepareQuarantine(unsafe, randomUUID())).rejects.toThrow(
      "RESET_UPLOAD_PATH_INVALID",
    );
    expect((await readdir(f.uploads)).sort()).toEqual(f.keys.sort());
    await expect(prepareQuarantine(f.application, "../escape")).rejects.toThrow(
      "RESET_GENERATION_INVALID",
    );
  });

  it("writes complete bound receipts atomically and refuses a substituted receipt", async () => {
    const f = await fixture();
    await sealBackup(f.backup, target, source);
    const backup = await resetBackup(f.backup, target);
    const generation = randomUUID();
    const receipt = await prepareCompletion(
      f.application,
      backup,
      target,
      generation,
    );
    const path = resolve(f.backup, `reset-${generation}.json`);
    expect(await readCompletion(backup, target, generation)).toEqual(receipt);
    await writeJson(
      path,
      { ...receipt, quarantineComplete: true },
      { replace: true },
    );
    expect((await readJson(path)).quarantineComplete).toBe(true);
    expect(
      (await readdir(f.backup)).some((name) => name.endsWith(".tmp")),
    ).toBe(false);
    await writeJson(
      path,
      { ...receipt, ownerIds: [randomUUID()] },
      { replace: true },
    );
    await expect(readCompletion(backup, target, generation)).rejects.toThrow(
      "RESET_COMPLETION_MISMATCH",
    );
    await expect(readCompletion(backup, target, "../escape")).rejects.toThrow(
      "RESET_GENERATION_INVALID",
    );
  });
});
