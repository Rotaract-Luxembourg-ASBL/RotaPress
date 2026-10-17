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
import { MediaAdminRepository } from "./MediaAdminRepository";
import { MediaBatchService } from "./MediaBatchService";
import { MediaUsageReader } from "./MediaUsageReader";
import { mediaUsageQuerySchema, type MediaUsageAccess } from "./media_usage";
import { PublicMediaCollection } from "./PublicMediaCollection";
import {
  mediaAdminListSchema,
  mediaMetadataSchema,
  mediaUpdateSchema,
  type MediaAssetDto,
} from "./media_schemas";
import {
  inspectImage,
  mediaMetadataRevision,
  privateMetadataSchema,
} from "./media_automation";
import { reviewedMediaPublicationSchema } from "./media_publication";

export type MediaUploadCommit = (
  persist: (tx: Transaction) => Promise<MediaAssetDto>,
) => Promise<MediaAssetDto>;

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
    sourceFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
const referencesSchema = z
  .array(z.uuid())
  .max(500)
  .transform((ids) => [...new Set(ids)]);
const sourceReviewSchema = z.strictObject({
  id: z.uuid(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
});
type MediaSourceReview = z.infer<typeof sourceReviewSchema>;

export class MediaService {
  private readonly repository: MediaRepository;
  private readonly audit = new AuditRepository();
  private readonly administration: MediaAdminRepository;
  private readonly batches: MediaBatchService;

  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly storage: StorageDriver,
  ) {
    this.repository = new MediaRepository(db);
    this.administration = new MediaAdminRepository(db);
    this.batches = new MediaBatchService(
      db,
      authorization,
      this.repository,
      this.audit,
      storage,
    );
  }

  async adminList(actor: TrustedActor, input: unknown) {
    const scope = await this.authorization.require(actor, "media.manage");
    return this.administration.list(
      scope.organizationId,
      mediaAdminListSchema.parse(input),
    );
  }

  async updateBatch(
    actor: TrustedActor,
    input: unknown,
    executor?: Transaction,
    kinds?: readonly MediaAssetDto["kind"][],
  ) {
    return this.batches.update(actor, input, executor, kinds);
  }

  async deleteBatch(actor: TrustedActor, input: unknown) {
    return this.batches.delete(actor, input);
  }

  deleteBatchInTransaction(
    actor: TrustedActor,
    input: unknown,
    tx: Transaction,
    kinds: readonly MediaAssetDto["kind"][],
  ) {
    return this.batches.deleteInTransaction(actor, input, tx, kinds);
  }

  cleanupDeleted(storageKeys: string[]) {
    return this.batches.cleanupDeleted(storageKeys);
  }

  async publicLibrary(actor: TrustedActor, input: unknown = {}) {
    const scope = await this.authorization.approved(actor);
    return new PublicMediaCollection(this.db).list(scope.organizationId, input);
  }

  async usage(
    actor: TrustedActor,
    id: string,
    raw: unknown = {},
    delegated?: MediaUsageAccess,
  ) {
    z.uuid().parse(id);
    const input = mediaUsageQuerySchema.parse(raw);
    return this.db.transaction(
      async (tx) => {
        const scope = await this.authorization.require(
          actor,
          "media.manage",
          tx,
        );
        const asset = await this.repository.details(
          id,
          scope.organizationId,
          tx,
        );
        if (!asset) throw this.unavailable();
        const references = await this.repository.usage(
          id,
          scope.organizationId,
          tx,
        );
        return {
          asset,
          ...(await new MediaUsageReader(this.authorization).destinations(
            actor,
            scope.organizationId,
            id,
            input,
            tx,
            delegated,
          )),
          savedReferences:
            references.find((row) => !row.published)?.references ?? 0,
          publishedReferences:
            references.find((row) => row.published)?.references ?? 0,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async upload(
    actor: TrustedActor,
    input: unknown,
    reauthorize?: () => Promise<void>,
    commit?: MediaUploadCommit,
  ): Promise<MediaAssetDto> {
    return this.uploadPrepared(
      actor,
      input,
      "private",
      reauthorize,
      undefined,
      commit,
    );
  }

  /** Staff uploads are public by default; delegated draft uploads keep their separate private boundary. */
  async uploadFromAdministration(
    actor: TrustedActor,
    input: unknown,
    reauthorize?: () => Promise<void>,
    sourceReview?: MediaSourceReview,
    commit?: MediaUploadCommit,
  ): Promise<MediaAssetDto> {
    await this.authorization.require(actor, "media.manage");
    const { visibility, ...values } = uploadSchema
      .extend({
        visibility: z.enum(["private", "public"]).default("public"),
      })
      .strict()
      .parse(input);
    return this.uploadPrepared(
      actor,
      values,
      visibility,
      reauthorize,
      sourceReview ? sourceReviewSchema.parse(sourceReview) : undefined,
      commit,
    );
  }

  private async uploadPrepared(
    actor: TrustedActor,
    input: unknown,
    visibility: "private" | "public",
    reauthorize?: () => Promise<void>,
    sourceReview?: MediaSourceReview,
    commit?: MediaUploadCommit,
  ): Promise<MediaAssetDto> {
    await this.authorization.require(actor, "media.manage");
    const { bytes, filename, requestId, sourceFingerprint, ...metadata } =
      uploadSchema.parse(input);
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          filename,
          ...metadata,
          ...(visibility === "public" ? { visibility } : {}),
          ...(sourceReview ? { sourceReview } : {}),
          ...(sourceFingerprint ? { sourceFingerprint } : {}),
        }),
      )
      .update(bytes)
      .digest("hex");
    const image = await prepareImage(bytes);
    const storageKey = await this.storage.write(image.bytes);
    try {
      await reauthorize?.();
      const persist = async (tx: Transaction) => {
        // Reload authority after expensive decoding; a concurrent suspension wins.
        const scope = await this.authorization.lock(actor, "media.manage", tx);
        if (sourceReview) {
          const source = await this.repository.details(
            sourceReview.id,
            scope.organizationId,
            tx,
          );
          if (!source) throw this.unavailable();
          if (mediaMetadataRevision(source) !== sourceReview.expectedRevision) {
            throw new DomainError(
              "MEDIA_METADATA_CHANGED",
              "The original image changed. Refresh the gallery and review it before creating an edited copy.",
              409,
            );
          }
        }
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
            return existing;
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
            visibility,
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
        return asset;
      };
      return commit
        ? await commit(persist)
        : await this.db.transaction(persist);
    } finally {
      // Receipt replay or rollback leaves the staged file unused. A post-commit
      // authorization failure must retain bytes already referenced by the asset.
      if (!(await this.repository.storageReferenced(storageKey)))
        await this.storage.delete(storageKey);
    }
  }

  async detail(
    actor: TrustedActor,
    id: string,
    executor: DatabaseExecutor = this.db,
  ): Promise<MediaAssetDto> {
    z.uuid().parse(id);
    const scope = await this.authorization.require(
      actor,
      "media.manage",
      executor,
    );
    const asset = await this.repository.details(
      id,
      scope.organizationId,
      executor,
    );
    if (!asset) throw this.unavailable();
    return asset;
  }

  async inspect(actor: TrustedActor, id: string) {
    const asset = await this.detail(actor, id);
    if (asset.kind !== "image")
      throw new DomainError(
        "MEDIA_IMAGE_REQUIRED",
        "Choose an image to inspect.",
        422,
      );
    const stored = await this.read(actor, id);
    const image = await inspectImage(stored.bytes);
    // Recheck after decoding; a suspended staff member must not receive pixels.
    await this.authorization.require(actor, "media.manage");
    return { asset, image };
  }

  async savePrivateMetadata(
    actor: TrustedActor,
    input: unknown,
    executor?: Transaction,
  ): Promise<MediaAssetDto> {
    const { id, expectedRevision, ...values } =
      privateMetadataSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const asset = await this.repository.asset(id, scope.organizationId, tx);
      if (!asset) throw this.unavailable();
      if (asset.kind !== "image")
        throw new DomainError(
          "MEDIA_IMAGE_REQUIRED",
          "This operation edits images only. Use the separately granted file operations.",
          422,
        );
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
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  async update(
    actor: TrustedActor,
    input: unknown,
    executor?: Transaction,
  ): Promise<MediaAssetDto> {
    const { id, expectedRevision, ...values } = mediaUpdateSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const asset = await this.repository.asset(id, scope.organizationId, tx);
      if (!asset) throw this.unavailable();
      if (
        expectedRevision &&
        mediaMetadataRevision(asset) !== expectedRevision
      ) {
        throw new DomainError(
          "MEDIA_METADATA_CHANGED",
          "This image changed. Refresh the gallery and review it before saving.",
          409,
        );
      }
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
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }

  /** A reviewed batch changes visibility only, in one authorized transaction. */
  async publishReviewed(
    actor: TrustedActor,
    input: unknown,
    executor?: Transaction,
    kinds: readonly MediaAssetDto["kind"][] = ["image"],
  ): Promise<MediaAssetDto[]> {
    const { assets: targets } = reviewedMediaPublicationSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const assets: MediaAssetDto[] = [];
      for (const target of targets) {
        const asset = await this.repository.details(
          target.id,
          scope.organizationId,
          tx,
        );
        if (!asset) throw this.unavailable();
        if (!kinds.includes(asset.kind))
          throw new DomainError(
            "MEDIA_KIND_REQUIRED",
            "This publication grant does not cover the selected file type.",
            422,
          );
        if (mediaMetadataRevision(asset) !== target.expectedRevision) {
          throw new DomainError(
            "MEDIA_METADATA_CHANGED",
            "One or more reviewed images changed. Read their current metadata and review the batch again before publishing.",
            409,
          );
        }
        assets.push(asset);
      }
      const published: MediaAssetDto[] = [];
      for (const asset of assets) {
        if (asset.visibility === "public") {
          published.push(asset);
          continue;
        }
        const updated = await this.repository.update(
          asset.id,
          scope.organizationId,
          {
            title: asset.title,
            alt: asset.alt,
            caption: asset.caption,
            tags: asset.tags,
            collection: asset.collection,
            visibility: "public",
          },
          tx,
        );
        await this.audit.record(tx, {
          organizationId: scope.organizationId,
          actorUserId: actor.userId,
          action: "media.published",
          targetId: asset.id,
        });
        published.push(updated);
      }
      return published;
    };
    return executor ? apply(executor) : this.db.transaction(apply);
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
    mimeType: MediaAssetDto["mimeType"];
    visibility: "private" | "public";
  }> {
    const asset = await this.deliveryAsset(actor, id);
    if (asset.kind !== "image")
      throw new DomainError(
        "MEDIA_IMAGE_REQUIRED",
        "Use file streaming to read this media.",
        422,
      );
    return {
      bytes: await this.storage.read(asset.storageKey),
      mimeType: asset.mimeType,
      visibility: asset.visibility,
    };
  }

  async deliveryAsset(actor: TrustedActor | null, id: string) {
    if (!z.uuid().safeParse(id).success) throw this.unavailable();
    const asset = await this.repository.installedAsset(id);
    if (!asset) throw this.unavailable();
    if (asset.visibility !== "public") {
      if (!actor) throw this.unavailable();
      const scope = await this.authorization.require(actor, "media.manage");
      if (scope.organizationId !== asset.organizationId)
        throw this.unavailable();
    }
    return asset;
  }

  async stream(
    actor: TrustedActor | null,
    id: string,
    range?: { start: number; end: number },
  ) {
    const asset = await this.deliveryAsset(actor, id);
    if (this.storage.stream) {
      const stream = await this.storage.stream(asset.storageKey, range);
      try {
        await this.deliveryAsset(actor, id);
      } catch (error) {
        await stream.cancel();
        throw error;
      }
      return stream;
    }
    const bytes = await this.storage.read(asset.storageKey);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new Uint8Array(
            range ? bytes.subarray(range.start, range.end + 1) : bytes,
          ),
        );
        controller.close();
      },
    });
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
  async assertAssetKinds(
    organizationId: string,
    references: { id: string; kind: MediaAssetDto["kind"] }[],
    executor: DatabaseExecutor,
  ) {
    const ids = referencesSchema.parse(
      references.map((reference) => reference.id),
    );
    const assets = await this.repository.references(
      organizationId,
      ids,
      executor,
    );
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    if (
      references.some(
        (reference) => byId.get(reference.id)?.kind !== reference.kind,
      )
    ) {
      throw new DomainError(
        "MEDIA_KIND_INVALID",
        "Choose a file of the correct type for each content block.",
        422,
      );
    }
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
        "Review and make every selected image public before publishing this content.",
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
