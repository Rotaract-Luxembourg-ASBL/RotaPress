import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { mediaUploadSession } from "../../../db/schema/media-uploads";
import { AuditRepository } from "@/core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
  type Transaction,
} from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import { LocalStorageDriver } from "@/infrastructure/storage/LocalStorageDriver";
import { MediaRepository } from "./MediaRepository";
import { prepareImage } from "./image_processing";
import { inspectMediaFile } from "./file_inspection";
import { UPLOAD_CHUNK_BYTES } from "./media_schemas";
import { uploadSessionSchema, type UploadSessionDto } from "./upload_schemas";
import { MediaUploadCleanup } from "./MediaUploadCleanup";

type Session = typeof mediaUploadSession.$inferSelect;
const hash = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
let finalizingUploads = 0;
const unavailable = () =>
  new DomainError(
    "MEDIA_UPLOAD_UNAVAILABLE",
    "This upload is unavailable or has expired. Choose the file again to start a new upload.",
    404,
  );
function dto(session: Session): UploadSessionDto {
  return {
    id: session.id,
    requestId: session.requestId,
    chunkSize: session.chunkSize === 65536 ? 65536 : UPLOAD_CHUNK_BYTES,
    received: Object.keys(session.chunks)
      .map(Number)
      .sort((a, b) => a - b),
    hashes: Object.fromEntries(
      Object.entries(session.chunks).map(([index, chunk]) => [
        index,
        chunk.hash,
      ]),
    ),
    totalChunks: Math.ceil(session.size / session.chunkSize),
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
    assetId: session.assetId,
  };
}

/** Durable bounded upload sessions; only a successful, currently authorized finalize creates media. */
export class MediaUploadService {
  private readonly repository: MediaRepository;
  private readonly cleanup: MediaUploadCleanup;
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly storage: LocalStorageDriver,
  ) {
    this.repository = new MediaRepository(db);
    this.cleanup = new MediaUploadCleanup(db, storage);
  }

  async start(
    actor: TrustedActor,
    input: unknown,
    chunkSize: 65536 | typeof UPLOAD_CHUNK_BYTES = UPLOAD_CHUNK_BYTES,
    executor?: Transaction,
  ): Promise<UploadSessionDto> {
    const values = uploadSessionSchema.parse(input);
    const inputHash = hash(JSON.stringify({ ...values, chunkSize }));
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const [previous] = await tx
        .select()
        .from(mediaUploadSession)
        .where(
          and(
            eq(mediaUploadSession.organizationId, scope.organizationId),
            eq(mediaUploadSession.requestId, values.requestId),
          ),
        );
      if (previous) {
        if (
          previous.actorUserId !== actor.userId ||
          (previous.inputHash !== inputHash &&
            !(
              chunkSize === UPLOAD_CHUNK_BYTES &&
              previous.chunkSize === UPLOAD_CHUNK_BYTES &&
              previous.inputHash === hash(JSON.stringify(values))
            ))
        ) {
          throw new DomainError(
            "MEDIA_UPLOAD_RETRY_CHANGED",
            "This upload request has different details. Retry the original file or start a new upload.",
            409,
          );
        }
        this.active(previous);
        return dto(previous);
      }
      const [pending] = await tx
        .select({
          count: count(),
          bytes:
            sql<number>`coalesce(sum(${mediaUploadSession.size}), 0)`.mapWith(
              Number,
            ),
        })
        .from(mediaUploadSession)
        .where(
          and(
            eq(mediaUploadSession.organizationId, scope.organizationId),
            eq(mediaUploadSession.status, "uploading"),
            gt(mediaUploadSession.expiresAt, new Date()),
          ),
        );
      if (
        pending.count >= 20 ||
        pending.bytes + values.size > 1024 * 1024 * 1024
      ) {
        throw new DomainError(
          "MEDIA_UPLOAD_LIMIT",
          "Finish or cancel existing uploads before adding more files.",
          429,
        );
      }
      const [created] = await tx
        .insert(mediaUploadSession)
        .values({
          organizationId: scope.organizationId,
          actorUserId: actor.userId,
          requestId: values.requestId,
          inputHash,
          input: values,
          size: values.size,
          chunkSize,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .returning();
      return dto(created);
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  private active(session: Session) {
    if (
      session.status === "cancelled" ||
      (session.status !== "complete" && session.expiresAt <= new Date())
    )
      throw unavailable();
  }
  private async session(
    actor: TrustedActor,
    id: string,
    tx?: Transaction,
    allowCancelled = false,
  ) {
    z.uuid().parse(id);
    const scope = tx
      ? await this.authorization.lock(actor, "media.manage", tx)
      : await this.authorization.require(actor, "media.manage");
    const [session] = await (tx ?? this.db)
      .select()
      .from(mediaUploadSession)
      .where(
        and(
          eq(mediaUploadSession.id, id),
          eq(mediaUploadSession.organizationId, scope.organizationId),
          eq(mediaUploadSession.actorUserId, actor.userId),
        ),
      );
    if (!session) throw unavailable();
    if (!allowCancelled) this.active(session);
    return session;
  }
  async status(actor: TrustedActor, id: string) {
    return dto(await this.session(actor, id));
  }

  async putChunk(
    actor: TrustedActor,
    id: string,
    index: number,
    bytes: Buffer,
  ) {
    const session = await this.session(actor, id);
    const total = Math.ceil(session.size / session.chunkSize);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= total ||
      bytes.length !==
        Math.min(session.chunkSize, session.size - index * session.chunkSize)
    ) {
      throw new DomainError(
        "MEDIA_UPLOAD_CHUNK",
        "This upload chunk is incomplete. Retry the file.",
        422,
      );
    }
    const digest = hash(bytes);
    const key = await this.storage.write(bytes, "part");
    let retained = false;
    try {
      const result = await this.db.transaction(async (tx) => {
        const current = await this.session(actor, id, tx);
        const existing = current.chunks[index];
        if (existing) {
          if (existing.hash !== digest)
            throw new DomainError(
              "MEDIA_UPLOAD_CHUNK_CHANGED",
              "The selected file changed. Cancel this upload and choose it again.",
              409,
            );
          return { session: current, reused: true };
        }
        if (current.status !== "uploading") throw unavailable();
        const [updated] = await tx
          .update(mediaUploadSession)
          .set({
            chunks: {
              ...current.chunks,
              [index]: { key, hash: digest },
            },
          })
          .where(eq(mediaUploadSession.id, id))
          .returning();
        return { session: updated, reused: false };
      });
      retained = !result.reused;
      return dto(result.session);
    } finally {
      if (!retained) await this.storage.delete(key);
    }
  }

  async finish(
    actor: TrustedActor,
    id: string,
    reauthorize?: () => Promise<unknown>,
  ) {
    if (finalizingUploads >= 2)
      throw new DomainError(
        "MEDIA_BUSY",
        "Two files are being saved. Retry this upload shortly.",
        429,
      );
    finalizingUploads++;
    try {
      return await this.finalize(actor, id, reauthorize);
    } finally {
      finalizingUploads--;
    }
  }
  private async finalize(
    actor: TrustedActor,
    id: string,
    reauthorize?: () => Promise<unknown>,
  ) {
    const session = await this.session(actor, id);
    if (session.status === "complete") return this.completed(session);
    const total = Math.ceil(session.size / session.chunkSize);
    const keys = Array.from(
      { length: total },
      (_, index) => session.chunks[index]?.key,
    );
    if (keys.some((key) => !key))
      throw new DomainError(
        "MEDIA_UPLOAD_INCOMPLETE",
        "Some chunks are missing. Resume this upload before saving.",
        409,
      );
    let pending: string | undefined, stored: string | undefined;
    let retained = false;
    try {
      pending = await this.storage.assemble(
        keys.filter((key): key is string => Boolean(key)),
        session.size,
      );
      let info: {
        kind: "image" | "document" | "audio" | "video";
        mimeType:
          | "image/webp"
          | "application/pdf"
          | "audio/mpeg"
          | "audio/mp4"
          | "video/mp4"
          | "video/webm";
        width: number | null;
        height: number | null;
        size: number;
      };
      if (session.input.kind === "image") {
        const image = await prepareImage(await this.storage.read(pending));
        stored = await this.storage.write(image.bytes);
        info = {
          kind: "image",
          mimeType: "image/webp",
          width: image.width,
          height: image.height,
          size: image.bytes.length,
        };
      } else {
        const inspected = await inspectMediaFile(
          await this.storage.inspectionPath(pending),
          session.input.kind,
          session.size,
        );
        stored = await this.storage.finalize(pending, inspected.extension);
        pending = undefined;
        info = {
          kind: inspected.kind,
          mimeType: inspected.mimeType,
          width: inspected.width,
          height: inspected.height,
          size: session.size,
        };
      }
      await reauthorize?.();
      const storageKey = stored;
      const result = await this.db.transaction(async (tx) => {
        const current = await this.session(actor, id, tx);
        if (current.status === "complete")
          return { asset: await this.completed(current, tx), reused: true };
        if (
          hash(JSON.stringify(current.chunks)) !==
          hash(JSON.stringify(session.chunks))
        ) {
          throw new DomainError(
            "MEDIA_UPLOAD_CHANGED",
            "This upload changed while being checked. Retry saving it.",
            409,
          );
        }
        const { title, alt, caption, collection, tags, filename, visibility } =
          session.input;
        const asset = await this.repository.insert(
          {
            organizationId: current.organizationId,
            uploaderId: actor.userId,
            storageKey,
            ...info,
            title,
            alt,
            caption,
            collection,
            tags,
            originalName: filename,
            visibility,
          },
          tx,
        );
        await tx
          .update(mediaUploadSession)
          .set({ status: "complete", assetId: asset.id })
          .where(eq(mediaUploadSession.id, id));
        await this.audit.record(tx, {
          organizationId: current.organizationId,
          actorUserId: actor.userId,
          action: "media.uploaded",
          targetId: asset.id,
        });
        return { asset, reused: false };
      });
      retained = !result.reused;
      // Committed receipts and hashes remain for retries, but staged bytes are no longer needed.
      await this.cleanup.session(id);
      return result.asset;
    } catch (error) {
      // A concurrent exact retry can finish and remove staging while this request assembles it.
      const current = await this.session(actor, id);
      if (current.status === "complete") return this.completed(current);
      throw error;
    } finally {
      if (pending) await this.storage.delete(pending);
      if (stored && !retained) await this.storage.delete(stored);
    }
  }
  private async completed(session: Session, tx?: Transaction) {
    const asset =
      session.assetId &&
      (await this.repository.details(
        session.assetId,
        session.organizationId,
        tx,
      ));
    if (!asset) throw unavailable();
    return asset;
  }
  async cancel(actor: TrustedActor, id: string) {
    await this.db.transaction(async (tx) => {
      const session = await this.session(actor, id, tx, true);
      if (session.status === "complete")
        throw new DomainError(
          "MEDIA_UPLOAD_COMPLETE",
          "This file is already in the library. Manage it there.",
          409,
        );
      await tx
        .update(mediaUploadSession)
        .set({ status: "cancelled" })
        .where(eq(mediaUploadSession.id, id));
    });
    await this.cleanup.session(id);
    return { cancelled: true };
  }
  async expire() {
    return this.cleanup.expire();
  }
}
