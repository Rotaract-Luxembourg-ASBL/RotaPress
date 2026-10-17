// Dedicated short-lived parser process. The parent supplies a checked staged path,
// no credentials, a wall-clock timeout and a bounded heap. It never executes PDF content.
import { open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mediaInfoFactory from "mediainfo.js";
import { PDFDocument } from "pdf-lib";

const [path, requestedKind, expectedSize] = process.argv.slice(2);
const fail = () => { throw new Error("Unsupported media"); };
const heapWatch = setInterval(() => {
  if (process.memoryUsage().rss > 384 * 1024 * 1024) process.exit(1);
}, 100);
heapWatch.unref();
async function inspect() {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== Number(expectedSize)) fail();
    if (requestedKind === "document") {
      if (stat.size > 25 * 1024 * 1024) fail();
      const bytes = await file.readFile();
      if (!bytes.subarray(0, 8).toString("ascii").startsWith("%PDF-")
        || !bytes.subarray(-1024).includes(Buffer.from("%%EOF"))) fail();
      const document = await PDFDocument.load(bytes, { ignoreEncryption: false,
        throwOnInvalidObject: true, updateMetadata: false, capNumbers: true });
      if (document.isEncrypted || document.getPageCount() < 1 || document.getPageCount() > 2000
        || document.context.enumerateIndirectObjects().length > 200_000) fail();
      return { kind: "document", mimeType: "application/pdf", extension: "pdf", width: null, height: null };
    }
    if (!["audio", "video"].includes(requestedKind)) fail();
    if (stat.size > (requestedKind === "audio" ? 100 : 500) * 1024 * 1024) fail();
    let bytesRead = 0, reads = 0;
    const inspector = await mediaInfoFactory({ format: "object", full: false,
      locateFile: () => fileURLToPath(import.meta.resolve("mediainfo.js/MediaInfoModule.wasm")) });
    let report;
    try {
      report = await inspector.analyzeData(stat.size, async (size, offset) => {
        if (!Number.isSafeInteger(size) || !Number.isSafeInteger(offset) || size <= 0 || size > 4 * 1024 * 1024
          || offset < 0 || offset >= stat.size || ++reads > 1024) fail();
        const buffer = Buffer.alloc(Math.min(size, stat.size - offset));
        const read = await file.read(buffer, 0, buffer.length, offset);
        bytesRead += read.bytesRead;
        if (bytesRead > 32 * 1024 * 1024) fail();
        return buffer.subarray(0, read.bytesRead);
      });
    } finally { inspector.close(); }
    const tracks = report?.media?.track;
    if (!Array.isArray(tracks) || tracks.length > 8 || tracks.some((track) => track.Encryption || track.IsTruncated === "Yes")) fail();
    const general = tracks.find((track) => track["@type"] === "General");
    const audio = tracks.filter((track) => track["@type"] === "Audio");
    const video = tracks.filter((track) => track["@type"] === "Video");
    if (!(Number(general?.Duration) > 0) || audio.length > 1 || video.length > 1) fail();
    const aac = (track) => track.Format === "AAC" && (track.Format_AdditionalFeatures === "LC"
      || track.Format_Profile === "LC" || track.CodecID === "mp4a-40-2");
    if (requestedKind === "audio") {
      if (video.length || audio.length !== 1) fail();
      if (general.Format === "MPEG Audio" && audio[0].Format === "MPEG Audio" && audio[0].Format_Profile === "Layer 3") {
        return { kind: "audio", mimeType: "audio/mpeg", extension: "mp3", width: null, height: null };
      }
      if (general.Format === "MPEG-4" && aac(audio[0])) {
        return { kind: "audio", mimeType: "audio/mp4", extension: "m4a", width: null, height: null };
      }
      fail();
    }
    if (video.length !== 1) fail();
    const width = Number(video[0].Width), height = Number(video[0].Height);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
      || width * height > 20_000_000) fail();
    if (general.Format === "MPEG-4" && video[0].Format === "AVC" && audio.every(aac)) {
      return { kind: "video", mimeType: "video/mp4", extension: "mp4", width, height };
    }
    if (general.Format === "WebM" && ["VP8", "VP9"].includes(video[0].Format)
      && audio.every((track) => ["Opus", "Vorbis"].includes(track.Format))) {
      return { kind: "video", mimeType: "video/webm", extension: "webm", width, height };
    }
    fail();
  } finally { await file.close(); }
}
inspect().then((result) => process.stdout.write(JSON.stringify(result))).catch(() => { process.exitCode = 1; });
