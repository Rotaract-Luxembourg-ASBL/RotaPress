import { z } from "zod";
import { mediaKindSchema, mediaLimits, mediaMetadataSchema, UPLOAD_CHUNK_BYTES } from "./media_schemas";

export const mediaFilenameSchema = z.string().trim().min(1).max(180).refine(
  (name) => !/[\\/:]/u.test(name) && [...name].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), "Use a filename without paths or control characters.",
);
export const uploadSessionSchema = mediaMetadataSchema.extend({
  requestId: z.uuid(), filename: mediaFilenameSchema,
  kind: mediaKindSchema, size: z.number().int().positive(),
  visibility: z.enum(["private", "public"]).default("public"),
}).strict().refine((value) => value.size <= mediaLimits[value.kind], "This file exceeds the size limit for its type.");
export type UploadSessionInput = z.infer<typeof uploadSessionSchema>;
export type UploadSessionDto = {
  id: string; requestId: string; chunkSize: 65536 | typeof UPLOAD_CHUNK_BYTES;
  received: number[]; totalChunks: number;
  hashes: Record<string, string>;
  status: "uploading" | "complete" | "cancelled"; expiresAt: string; assetId: string | null;
};
