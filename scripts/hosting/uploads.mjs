import { once } from "node:events";
import { chown, lstat, mkdir, readdir } from "node:fs/promises";
import { backupUploads, restoreUploads } from "./upload-archive.mjs";

const root = "/app/.data/uploads";
async function writeLine(value) {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`)) await once(process.stdout, "drain");
}
async function directory() {
  if (process.platform !== "linux" || process.cwd() !== "/app") throw new Error();
  for (const path of ["/app/.data", root]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    await chown(path, 10001, 10001);
  }
}
async function main() {
  await directory();
  const mode = process.argv[2];
  const names = await readdir(root);
  if (mode === "backup") await backupUploads(root, names, writeLine);
  else if (mode === "empty") { if (names.length) throw new Error(); }
  else if (mode === "restore") { if (names.length) throw new Error(); await restoreUploads(root, process.stdin, (path) => chown(path, 10001, 10001)); }
  else throw new Error();
}
main().catch(() => {
  console.error("Upload archive operation refused: check archive integrity and use an empty recovery volume.");
  process.exitCode = 1;
});
