import "server-only";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { DomainError } from "@/core/DomainError";
import type { MediaKind } from "./media_schemas";

const resultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("document"), mimeType: z.literal("application/pdf"), extension: z.literal("pdf"), width: z.null(), height: z.null() }),
  z.strictObject({ kind: z.literal("audio"), mimeType: z.enum(["audio/mpeg", "audio/mp4"]), extension: z.enum(["mp3", "m4a"]), width: z.null(), height: z.null() }),
  z.strictObject({ kind: z.literal("video"), mimeType: z.enum(["video/mp4", "video/webm"]), extension: z.enum(["mp4", "webm"]), width: z.number().int().positive().max(20_000), height: z.number().int().positive().max(20_000) }),
]);
let active = 0;
export async function inspectMediaFile(path: string, kind: Exclude<MediaKind, "image">, size: number) {
  if (active >= 2) throw new DomainError("MEDIA_BUSY", "Two files are being checked. Retry this upload shortly.", 429);
  active++;
  try {
    const result = await new Promise<string>((resolveResult, reject) => {
      const script = resolve(/* turbopackIgnore: true */ process.cwd(), "scripts", "media-inspect.mjs");
      const dependencies = resolve(/* turbopackIgnore: true */ process.cwd(), "node_modules");
      const worker = spawn(process.execPath, ["--max-old-space-size=128", "--permission",
        `--allow-fs-read=${script}`, `--allow-fs-read=${dependencies}`, `--allow-fs-read=${path}`,
        script, path, kind, String(size)], {
        windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
        env: { NODE_ENV: "production", ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } : {}) },
      });
      let output = "";
      const timer = setTimeout(() => { worker.kill("SIGKILL"); reject(new Error("Parser timeout")); }, 30_000);
      worker.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.length > 4096) worker.kill("SIGKILL");
      });
      worker.on("error", (error) => { clearTimeout(timer); reject(error); });
      worker.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0 && output.length <= 4096) resolveResult(output);
        else reject(new Error("Media validation failed"));
      });
    });
    const parsed = resultSchema.parse(JSON.parse(result));
    if (parsed.kind !== kind) throw new Error("Mismatched file type");
    return parsed;
  } catch {
    throw new DomainError("MEDIA_FORMAT_UNSUPPORTED",
      "This file could not be safely read. Use an unencrypted PDF, MP3, AAC-LC M4A, H.264 MP4, or VP8/VP9 WebM within the size limit.", 422);
  } finally { active--; }
}
