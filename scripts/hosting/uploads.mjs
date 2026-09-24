import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  chown,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

const root = "/app/.data/uploads";
const keyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/u;
const maximum = 5 * 1024 * 1024;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function writeLine(value) {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`))
    await once(process.stdout, "drain");
}

async function directory() {
  if (process.platform !== "linux" || process.cwd() !== "/app")
    throw new Error();
  for (const path of ["/app/.data", root]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    await chown(path, 10001, 10001);
  }
}
async function* lines() {
  let pending = "";
  for await (const chunk of process.stdin) {
    pending += chunk.toString("utf8");
    let at;
    while ((at = pending.indexOf("\n")) >= 0) {
      if (at > maximum * 1.4) throw new Error();
      yield pending.slice(0, at);
      pending = pending.slice(at + 1);
    }
    if (pending.length > maximum * 1.4) throw new Error();
  }
  if (pending) throw new Error();
}
async function main() {
  await directory();
  const mode = process.argv[2];
  const names = await readdir(root);
  if (mode === "backup") {
    for (const key of names.sort()) {
      const path = resolve(root, key);
      const stat = await lstat(path);
      if (
        !keyPattern.test(key) ||
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.size > maximum
      )
        throw new Error();
      const bytes = await readFile(path);
      await writeLine({
        key,
        sha256: digest(bytes),
        data: bytes.toString("base64"),
      });
    }
    await writeLine({ complete: true, files: names.length });
  } else if (mode === "empty") {
    if (names.length) throw new Error();
  } else if (mode === "restore") {
    if (names.length) throw new Error();
    let count = 0,
      complete = false;
    for await (const line of lines()) {
      if (complete) throw new Error();
      const entry = JSON.parse(line);
      if (entry.complete === true) {
        if (entry.files !== count) throw new Error();
        complete = true;
        continue;
      }
      if (!keyPattern.test(entry.key) || typeof entry.data !== "string")
        throw new Error();
      const bytes = Buffer.from(entry.data, "base64");
      if (
        !bytes.length ||
        bytes.length > maximum ||
        digest(bytes) !== entry.sha256
      )
        throw new Error();
      const path = resolve(root, entry.key);
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
      await chown(path, 10001, 10001);
      count++;
    }
    if (!complete) throw new Error();
  } else throw new Error();
}
main().catch(() => {
  console.error(
    "Upload archive operation refused: check archive integrity and use an empty recovery volume.",
  );
  process.exitCode = 1;
});
