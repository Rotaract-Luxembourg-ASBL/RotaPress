import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";

const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|pdf|mp3|m4a|mp4|webm|part|pending)$/u;
const limits = { webp: 5, pdf: 25, mp3: 100, m4a: 100, mp4: 500, webm: 500, part: 4, pending: 500 };
const chunkSize = 1024 * 1024;
const maximum = (key) => limits[key.split(".").at(-1)] * 1024 * 1024;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function* lines(input) {
  let pending = "";
  // Legacy image-only archives contain one base64 line per file, at most 5 MiB.
  const maximumLine = 7 * 1024 * 1024;
  for await (const chunk of input) {
    pending += chunk.toString("utf8");
    let at;
    while ((at = pending.indexOf("\n")) >= 0) {
      if (at > maximumLine) throw new Error();
      yield pending.slice(0, at);
      pending = pending.slice(at + 1);
    }
    if (pending.length > maximumLine) throw new Error();
  }
  if (pending) throw new Error();
}
function decode(value, limit) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw new Error();
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > limit) throw new Error();
  return bytes;
}
export async function backupUploads(root, names, writeLine) {
  for (const key of names.sort()) {
    if (!keyPattern.test(key)) throw new Error();
    const path = resolve(root, key);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size <= 0 || stat.size > maximum(key)) throw new Error();
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new Error();
      await writeLine({ start: key, size: stat.size, version: 2 });
      const hash = createHash("sha256");
      let index = 0, total = 0;
      for await (const bytes of handle.createReadStream({ highWaterMark: chunkSize, autoClose: false })) {
        hash.update(bytes); total += bytes.length;
        if (total > stat.size) throw new Error();
        await writeLine({ chunk: index++, data: bytes.toString("base64") });
      }
      if (total !== stat.size) throw new Error();
      await writeLine({ end: key, chunks: index, sha256: hash.digest("hex") });
    } finally { await handle.close(); }
  }
  await writeLine({ complete: true, files: names.length });
}
export async function restoreUploads(root, input, own = async () => {}) {
  let count = 0, complete = false, current;
  try {
    for await (const line of lines(input)) {
      if (complete) throw new Error();
      const entry = JSON.parse(line);
      if (entry.complete === true) {
        if (current || entry.files !== count) throw new Error();
        complete = true;
      } else if (entry.start) {
        if (current || entry.version !== 2 || !keyPattern.test(entry.start)
          || !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > maximum(entry.start)) throw new Error();
        const path = resolve(root, entry.start);
        current = { key: entry.start, size: entry.size, total: 0, chunks: 0,
          hash: createHash("sha256"), handle: await open(path, "wx", 0o600) };
        await own(path);
      } else if (entry.chunk !== undefined) {
        if (!current || entry.chunk !== current.chunks) throw new Error();
        const bytes = decode(entry.data, chunkSize);
        current.total += bytes.length; current.chunks++;
        if (current.total > current.size) throw new Error();
        current.hash.update(bytes);
        await current.handle.writeFile(bytes);
      } else if (entry.end) {
        if (!current || entry.end !== current.key || entry.chunks !== current.chunks
          || current.total !== current.size || entry.sha256 !== current.hash.digest("hex")) throw new Error();
        await current.handle.sync(); await current.handle.close();
        current = undefined; count++;
      } else {
        if (current || !keyPattern.test(entry.key) || !entry.key.endsWith(".webp")) throw new Error();
        const bytes = decode(entry.data, 5 * 1024 * 1024);
        if (digest(bytes) !== entry.sha256) throw new Error();
        const path = resolve(root, entry.key);
        const handle = await open(path, "wx", 0o600);
        try { await handle.writeFile(bytes); } finally { await handle.close(); }
        await own(path); count++;
      }
    }
    if (!complete || current) throw new Error();
  } finally { await current?.handle.close(); }
}
