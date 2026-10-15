import "server-only";
import type { AuditRepository } from "../../core/audit/AuditRepository";
import { DomainError, type AuthorizationService, type Transaction, type TrustedActor } from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { StorageDriver } from "../../infrastructure/storage/LocalStorageDriver";
import type { MediaRepository } from "./MediaRepository";
import { mediaMetadataRevision } from "./media_automation";
import { mediaBatchDeleteSchema, mediaBatchUpdateSchema, type MediaAssetDto } from "./media_schemas";

type Target = { id: string; expectedRevision: string };

/** Review every target before changing any row; organization locking also serializes content references. */
export class MediaBatchService {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly repository: MediaRepository,
    private readonly audit: AuditRepository,
    private readonly storage: StorageDriver,
  ) {}

  async update(actor: TrustedActor, input: unknown): Promise<MediaAssetDto[]> {
    const { assets: targets, ...values } = mediaBatchUpdateSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const assets = await this.review(targets, scope.organizationId, tx);
      if ("visibility" in values && values.visibility === "private") {
        const used = await this.repository.usedAssetIds(targets.map((target) => target.id), scope.organizationId, tx, true);
        if (used.size) throw new DomainError("MEDIA_PUBLISHED_REFERENCE",
          `${this.names(assets.filter((asset) => used.has(asset.id)))} used by published content. Remove these images from published content before making the selection private. No images were changed.`, 409);
      }
      const updated = await this.repository.updateSelection(
        targets.map((target) => target.id), scope.organizationId, values, tx,
      );
      for (const asset of updated) await this.audit.record(tx, {
        organizationId: scope.organizationId, actorUserId: actor.userId,
        action: "visibility" in values ? "media.visibility.updated" : "media.metadata.updated",
        targetId: asset.id,
      });
      const byId = new Map(updated.map((asset) => [asset.id, asset]));
      return targets.map((target) => byId.get(target.id)!);
    });
  }

  async delete(actor: TrustedActor, input: unknown): Promise<string[]> {
    const { assets: targets } = mediaBatchDeleteSchema.parse(input);
    const deleted = await this.db.transaction(async (tx) => {
      const scope = await this.authorization.lock(actor, "media.manage", tx);
      const assets = await this.review(targets, scope.organizationId, tx);
      const used = await this.repository.usedAssetIds(targets.map((target) => target.id), scope.organizationId, tx);
      if (used.size) throw new DomainError("MEDIA_REFERENCED",
        `${this.names(assets.filter((asset) => used.has(asset.id)))} retained by content or revision history. Remove these images from the selection before deleting. No images were deleted.`, 409);
      await this.repository.deleteSelection(targets.map((target) => target.id), scope.organizationId, tx);
      for (const asset of assets) await this.audit.record(tx, {
        organizationId: scope.organizationId, actorUserId: actor.userId,
        action: "media.deleted", targetId: asset.id,
      });
      return assets;
    });
    // Delivery is revoked atomically first. A cleanup failure only leaves an inaccessible orphan.
    const cleanup = await Promise.allSettled(deleted.map((asset) => this.storage.delete(asset.storageKey)));
    const failures = cleanup.filter((result) => result.status === "rejected").length;
    if (failures) console.warn(`Media file cleanup failed for ${failures} deleted images.`);
    return targets.map((target) => target.id);
  }

  private async review(targets: Target[], organizationId: string, tx: Transaction) {
    const assets = await this.repository.batchAssets(targets.map((target) => target.id), organizationId, tx);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    for (const target of targets) {
      const asset = byId.get(target.id);
      if (!asset) throw new DomainError("MEDIA_NOT_FOUND",
        "One or more selected images are unavailable. Refresh the gallery and review your selection. No images were changed.", 404);
      if (mediaMetadataRevision(asset) !== target.expectedRevision) throw new DomainError("MEDIA_METADATA_CHANGED",
        "One or more selected images changed. Refresh the gallery and review your selection. No images were changed.", 409);
    }
    return assets;
  }

  private names(assets: MediaAssetDto[]) {
    const names = assets.slice(0, 3).map((asset) => `“${(asset.title || asset.originalName).slice(0, 80)}”`).join(", ");
    return `${names}${assets.length > 3 ? ` and ${assets.length - 3} more images are` : assets.length === 1 ? " is" : " are"}`;
  }
}
