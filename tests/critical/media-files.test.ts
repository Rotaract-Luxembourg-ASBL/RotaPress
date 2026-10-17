import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorageDriver } from "../../src/infrastructure/storage/LocalStorageDriver";
import { inspectMediaFile } from "../../src/features/media/file_inspection";
import { mediaRange } from "../../src/features/media/media_delivery";
import { mediaLimits, UPLOAD_CHUNK_BYTES } from "../../src/features/media/media_schemas";
import { uploadSessionSchema } from "../../src/features/media/upload_schemas";
import { mediaCodecFixtures } from "./media-codec-fixtures";

const base = resolve(".local/test-uploads");
const root = resolve(base, `files-${randomUUID()}`);
const storage = new LocalStorageDriver(root);
beforeAll(async () => { await mkdir(root, { recursive: true }); });
afterAll(async () => {
  if (dirname(root) !== base) throw new Error("Unsafe test cleanup");
  await rm(root, { recursive: true, force: true });
});

describe("media file parsing, staging and bounded delivery", () => {
  it("recognizes real supported audio/video codecs and rejects wrong container kinds", async () => {
    for (const [name, encoded] of Object.entries(mediaCodecFixtures)) {
      const bytes = Buffer.from(encoded, "base64");
      const key = await storage.write(bytes, "pending");
      const path = await storage.inspectionPath(key);
      if (name === "opus.webm") {
        await expect(inspectMediaFile(path, "audio", bytes.length)).rejects.toMatchObject({ code: "MEDIA_FORMAT_UNSUPPORTED" });
      } else {
        const kind = name.endsWith(".m4a") ? "audio" : "video";
        const result = await inspectMediaFile(path, kind, bytes.length);
        expect(result.kind).toBe(kind);
        expect(result.mimeType).toBe(name.endsWith(".m4a") ? "audio/mp4" : name.endsWith(".mp4") ? "video/mp4" : "video/webm");
        await expect(inspectMediaFile(path, kind === "audio" ? "video" : "audio", bytes.length)).rejects.toMatchObject({ code: "MEDIA_FORMAT_UNSUPPORTED" });
      }
    }
    // MPEG-1 Layer III frames with empty side information and zero sample data.
    const frame = Buffer.alloc(417); frame.set([0xff, 0xfb, 0x90, 0x00]);
    const mp3 = Buffer.concat(Array.from({ length: 12 }, () => frame));
    const key = await storage.write(mp3, "pending");
    expect(await inspectMediaFile(await storage.inspectionPath(key), "audio", mp3.length)).toMatchObject({ mimeType: "audio/mpeg" });
  });
  it("validates a real PDF in an isolated parser and rejects forged or wrong-kind files", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 100]);
    const bytes = Buffer.from(await pdf.save());
    const key = await storage.write(bytes, "pending");
    const path = await storage.inspectionPath(key);
    expect(await inspectMediaFile(path, "document", bytes.length)).toMatchObject({
      kind: "document", mimeType: "application/pdf", width: null, height: null,
    });
    await expect(inspectMediaFile(path, "audio", bytes.length)).rejects.toMatchObject({ code: "MEDIA_FORMAT_UNSUPPORTED" });
    const forged = Buffer.from("%PDF-1.7\nnot a PDF document\n%%EOF");
    const forgedKey = await storage.write(forged, "pending");
    await expect(inspectMediaFile(await storage.inspectionPath(forgedKey), "document", forged.length)).rejects.toMatchObject({ code: "MEDIA_FORMAT_UNSUPPORTED" });
  });

  it("assembles bounded chunks, streams exact bytes and prevents oversized or unsafe storage", async () => {
    const first = Buffer.alloc(UPLOAD_CHUNK_BYTES, 0x47);
    const last = Buffer.from("synthetic final chunk");
    const a = await storage.write(first, "part");
    const b = await storage.write(last, "part");
    const pending = await storage.assemble([a, b], first.length + last.length);
    const final = await storage.finalize(pending, "mp4");
    const stream = await storage.stream(final, { start: first.length - 3, end: first.length + 8 });
    expect(Buffer.from(await new Response(stream).arrayBuffer())).toEqual(Buffer.concat([Buffer.from("GGG"), last.subarray(0, 9)]));
    await expect(storage.assemble([a], first.length + 1)).rejects.toThrow("Incomplete");
    await expect(storage.write(Buffer.alloc(UPLOAD_CHUNK_BYTES + 1), "part")).rejects.toThrow("Invalid stored");
    await expect(storage.stream("../secret.mp4")).rejects.toThrow("Invalid media");
    await expect(storage.stream(final, { start: 0, end: first.length + last.length })).rejects.toThrow("Invalid file range");
  });

  it("accepts only satisfiable single byte ranges with bounded integers", () => {
    expect(mediaRange(null, 100)).toBeNull();
    expect(mediaRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(mediaRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(mediaRange("bytes=-12", 100)).toEqual({ start: 88, end: 99 });
    expect(mediaRange("bytes=-1000", 100)).toEqual({ start: 0, end: 99 });
    expect(mediaRange("bytes=10-999", 100)).toEqual({ start: 10, end: 99 });
    for (const value of ["bytes=100-", "bytes=12-3", "bytes=-0", "bytes=0-1,4-5", "units=0-1", "bytes=-", "bytes=999999999999999999-"]) {
      expect(mediaRange(value, 100)).toBe("invalid");
    }
  });

  it("applies kind-specific size limits and rejects upload metadata paths", () => {
    for (const [kind, maximum] of Object.entries(mediaLimits)) {
      const input = { requestId: randomUUID(), filename: "synthetic.file", kind, size: maximum };
      expect(uploadSessionSchema.parse(input).visibility).toBe("public");
      expect(uploadSessionSchema.safeParse({ ...input, size: maximum + 1 }).success).toBe(false);
      expect(uploadSessionSchema.safeParse({ ...input, filename: "../file" }).success).toBe(false);
    }
  });
});
