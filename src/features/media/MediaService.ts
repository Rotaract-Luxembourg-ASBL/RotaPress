import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { StorageDriver } from "../../infrastructure/storage/LocalStorageDriver";
import { prepareImage } from "./image_processing";
import { MediaRepository } from "./MediaRepository";
import {
  mediaMetadataSchema,
  mediaUpdateSchema,
  type MediaAssetDto,
} from "./media_schemas";
import {
  inspectImage,
  mediaMetadataRevision,
  privateMetadataSchema,
} from "./media_automation";

const uploadSchema = mediaMetadataSchema
  .extend({
    filename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine(
        (name) =>
          !name.includes("/") &&
          !name.includes("\\") &&
          !name.includes(":") &&
          [...name].every(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          ),
        "Use a filename without paths or control characters.",
      ),
    bytes: z.instanceof(Buffer),
    requestId: z.uuid().optional(),
  })
  .strict();
const referencesSchema = z
  .array(z.uuid())
  .max(500)
  .transform((ids) => [...new Set(ids)]);

export class MediaService {
  private readonly repository: MediaRepository;
  private readonly audit = new AuditRepository();

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageDriver,
  ) {
    this.repository = new MediaRepository(db);
  }

  async list(actor: TrustedActor): Promise<MediaAssetDto[]> {
    const scope = await this.authorization.require(actor, "media.manage");
    return this.repository.list(scope.organizationId);
  }
  async publicLibrary(actor: TrustedActor): Promise<MediaAssetDto[]> {
    const scope = await this.authorization.approved(actor);
    return (await this.repository.list(scope.organizationId, true)).map(
      (asset) => ({
        ...asset,
        originalName: asset.title || "Public image",
        tags: [],
        collection: "",
      }),
    );
  }

  async usage(actor: TrustedActor, id: string) {
    z.uuid().parse(id);
    const scope = await this.authorization.require(actor, "media.manage");
    const asset = await this.repository.details(id, scope.organizationId);
    if (!asset) throw this.unavailable();
    const references = await this.repository.usage(id, scope.organizationId);
    return {
      asset,
      savedReferences:
        references.find((row) => !row.published)?.references ?? 0,
      publishedReferences:
        references.find((row) => row.published)?.references ?? 0,
    };
  }

  async upload(
    actor: TrustedActor,
    input: unknown,
    reauthorize?: () => Promise<void>,
  ): Promise<MediaAssetDto> {
    await this.authorization.require(actor, "media.manage");
    const { bytes, filename, requestId, ...metadata } =
      uploadSchema.parse(input);
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ filename, ...metadata }))
      .update(bytes)
      .digest("hex");
    const image = await prepareImage(bytes);
    const storageKey = await this.storage.write(image.bytes);
    try {
      await reauthorize?.();
      const result = await this.db.transaction(async (tx) => {
        // Reload authority after expensive decoding; a concurrent suspension wins.
        const scope = await this.authorization.lock(actor, "media.manage", tx);
        if (requestId) {
          const previous = await this.repository.uploadReceipt(
            scope.organizationId,
            requestId,
            tx,
          );
          if (previous) {
            if (
              previous.actorUserId !== actor.userId ||
              previous.inputHash !== inputHash
            ) {
              throw new DomainError(
                "MEDIA_UPLOAD_RETRY_CHANGED",
                "This upload request was already used. Retry the same image and metadata or choose a new request ID.",
                409,
              );
            }
            const existing = await this.repository.details(
              previous.assetId,
              scope.organizationId,
              tx,
            );
            if (!existing) throw this.unavailable();
            return { asset: existing, reused: true };
          }
        }
        const asset = await this.repository.insert(
          {
            ...metadata,
            organizationId: scope.organizationId,
            uploaderId: actor.userId,
            originalName: filename,
            storageKey,
            size: image.bytes.length,
            width: image.width,
            height: image.height,
            visibility: "private",
          },
          tx,
        );
        if (requestId)
          await this.repository.recordUpload(
            {
              organizationId: scope.organizationId,
              requestId,
              actorUserId: actor.userId,
              inputHash,
              assetId: asset.id,
            },
            tx,
          );
        await this.audit.record(tx, {
          organizationId: scope.organizationId,
          actorUserId: actor.userId,
          action: "media.uploaded",
          targetId: asset.id,
        });
        return { asset, reused: false };
      });
      if (result.reused) await this.storage.delete(storageKey);
      return result.asset;
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }

  async detail(actor: TrustedActor, id: string): Promise<MediaAssetDto> {
    z.uuid().parse(id);
    const scope = await this.authorization.require(actor, "media.manage");
    const asset = await this.repository.details(id, scope.organizationId);
    if (!asset) throw this.unavailable();
    return asset;
  }

  async inspect(actor: TrustedActor, id: string) {
    const asset = await this.detail(actor, id);
    const stored = await this.read(actor, id);
    const image = await inspectImage(stored.bytes);
    // Recheck after decoding; a suspended staff member must not receive pixels.
    await this.authorization.require(actor, "media.manage");
    return { asset, image };
  }

  async savePrivateMetadata(
    actor: TrustedActor,
    input: unknown,
  ): Promise<MediaAssetDto> {
    const { id, expectedRevision, ...values } =
      privateMetadataSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const asset = await this.repository.asset(id, scope.organizationId, tx);
      if (!asset) throw this.unavailable();
      if (asset.visibility !== "private") {
        throw new DomainError(
          "MEDIA_PUBLIC_EDIT_MANUAL",
          "Edit public image metadata in Media after human review.",
          409,
        );
      }
      if (mediaMetadataRevision(asset) !== expectedRevision) {
        throw new DomainError(
          "MEDIA_METADATA_CHANGED",
          "The image metadata changed. Read it again before saving.",
          409,
        );
      }
      const updated = await this.repository.update(
        id,
        scope.organizationId,
        { ...values, visibility: "private" },
        tx,
      );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "media.metadata.updated",
        targetId: id,
      });
      return updated;
    });
  }

  async update(actor: TrustedActor, input: unknown): Promise<MediaAssetDto> {
    const { id, ...values } = mediaUpdateSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const asset = await this.repository.asset(id, scope.organizationId, tx);
      if (!asset) throw this.unavailable();
      if (
        values.visibility === "private" &&
        (await this.repository.used(id, scope.organizationId, tx, true))
      ) {
        throw new DomainError(
          "MEDIA_PUBLISHED_REFERENCE",
          "Remove this image from published content before making it private.",
          409,
        );
      }
      const updated = await this.repository.update(
        id,
        scope.organizationId,
        values,
        tx,
      );
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "media.updated",
        targetId: id,
      });
      return updated;
    });
  }

  async delete(actor: TrustedActor, id: string): Promise<void> {
    z.uuid().parse(id);
    const key = await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const asset = await this.repository.asset(id, scope.organizationId, tx);
      if (!asset) throw this.unavailable();
      if (await this.repository.used(id, scope.organizationId, tx)) {
        throw new DomainError(
          "MEDIA_REFERENCED",
          "This image is retained by content or revision history and cannot be deleted.",
          409,
        );
      }
      await this.repository.delete(id, scope.organizationId, tx);
      await this.audit.record(tx, {
        organizationId: scope.organizationId,
        actorUserId: actor.userId,
        action: "media.deleted",
        targetId: id,
      });
      return asset.storageKey;
    });
    // Revoke delivery first. Failed filesystem cleanup may leave an inaccessible
    // orphan, never a published database record pointing to a deleted object.
    await this.storage.delete(key);
  }

  async read(
    actor: TrustedActor | null,
    id: string,
  ): Promise<{
    bytes: Buffer;
    mimeType: "image/webp";
    visibility: "private" | "public";
  }> {
    if (!z.uuid().safeParse(id).success) throw this.unavailable();
    const asset = await this.repository.installedAsset(id);
    if (!asset) throw this.unavailable();
    if (asset.visibility !== "public") {
      if (!actor) throw this.unavailable();
      const scope = await this.authorization.require(actor, "media.manage");
      if (scope.organizationId !== asset.organizationId)
        throw this.unavailable();
    }
    return {
      bytes: await this.storage.read(asset.storageKey),
      mimeType: "image/webp",
      visibility: asset.visibility,
    };
  }

  /** Mutation callers hold the organization lock until their content write commits. */
  async assertOwnedAssets(
    organizationId: string,
    inputIds: string[],
    executor: DatabaseExecutor,
  ): Promise<void> {
    const ids = referencesSchema.parse(inputIds);
    const assets = await this.repository.references(
      organizationId,
      ids,
      executor,
    );
    if (assets.length !== ids.length)
      throw new DomainError(
        "MEDIA_SCOPE_INVALID",
        "One or more selected images are unavailable to this club.",
        422,
      );
  }

  /** A private upload never becomes public simply by being selected in a block. */
  async publicationIssues(actor: TrustedActor, inputIds: string[]) {
    const scope = await this.authorization.require(actor, "media.manage");
    const ids = referencesSchema.parse(inputIds);
    const assets = await this.repository.references(
      scope.organizationId,
      ids,
      this.db,
    );
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return ids.flatMap((referenceId) => {
      const asset = byId.get(referenceId);
      if (asset?.visibility === "public") return [];
      return [
        {
          referenceId,
          id: asset?.id ?? null,
          name: asset ? asset.title || asset.originalName : "Unavailable image",
          status: asset ? ("private" as const) : ("unavailable" as const),
        },
      ];
    });
  }

  /** Enforced again inside the publishing transaction, regardless of the review. */
  async assertPublicAssets(
    organizationId: string,
    inputIds: string[],
    executor: DatabaseExecutor,
  ): Promise<void> {
    const ids = referencesSchema.parse(inputIds);
    const assets = await this.repository.references(
      organizationId,
      ids,
      executor,
    );
    if (
      assets.length !== ids.length ||
      assets.some((asset) => asset.visibility !== "public")
    ) {
      throw new DomainError(
        "MEDIA_NOT_PUBLIC",
        "Make every selected image public in Media before publishing this content.",
        422,
      );
    }
  }

  /** Published usage prevents hiding; all usage protects immutable revision restore. */
  async replaceUsage(
    ownerKey: string,
    organizationId: string,
    inputIds: string[],
    tx: Transaction,
    published = false,
  ): Promise<void> {
    const ids = referencesSchema.parse(inputIds);
    z.string().min(1).max(160).parse(ownerKey);
    await this.assertOwnedAssets(organizationId, ids, tx);
    if (published) await this.assertPublicAssets(organizationId, ids, tx);
    await this.repository.replaceUsage(
      ownerKey,
      organizationId,
      ids,
      tx,
      published,
    );
  }

  private unavailable(): DomainError {
    return new DomainError(
      "MEDIA_NOT_FOUND",
      "This image is unavailable.",
      404,
    );
  }
}
