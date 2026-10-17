import "server-only";
import { AlbumReader } from "../media/AlbumReader";
import { contentAlbums } from "./cms_albums";
import { and, eq } from "drizzle-orm";
import { cmsEditorCheckpoint } from "../../../db/schema/cms-workspace";
import type { Database } from "@/infrastructure/database/client";
import {
  DomainError,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import type { CmsDraftService } from "./CmsDraftService";
import type { CmsScopePolicy } from "./CmsScopePolicy";
import type { MediaService } from "../media/MediaService";
import { CmsRepository } from "./CmsRepository";
import { variantInput } from "./cms_commands";
import { revisionInputSchema } from "./cms_schemas";
import { contentAssets } from "./cms_validation";
import {
  checkpointDiscardSchema,
  checkpointSaveSchema,
  type EditorCheckpoint,
} from "./cms_workspace_schemas";

export class CmsCheckpointService {
  private readonly repository: CmsRepository;
  constructor(
    private readonly db: Database,
    private readonly scope: CmsScopePolicy,
    private readonly drafts: CmsDraftService,
    private readonly media: MediaService,
  ) {
    this.repository = new CmsRepository(db);
  }

  async read(
    actor: TrustedActor,
    input: unknown,
  ): Promise<{ checkpoint: EditorCheckpoint | null }> {
    const { id, locale } = variantInput.parse(input);
    const { organizationId } = await this.scope.read(actor, id);
    const variant = await this.repository.variant(organizationId, id, locale);
    if (!variant)
      throw new DomainError(
        "CONTENT_NOT_FOUND",
        "This page is unavailable.",
        404,
      );
    const [saved] = await this.db
      .select()
      .from(cmsEditorCheckpoint)
      .where(
        and(
          eq(cmsEditorCheckpoint.actorId, actor.userId),
          eq(cmsEditorCheckpoint.variantId, variant.id),
          eq(cmsEditorCheckpoint.organizationId, organizationId),
        ),
      );
    return {
      checkpoint: saved
        ? {
            document: revisionInputSchema.parse(saved.document),
            baseRevisionId: saved.baseRevisionId,
            version: saved.version,
            updatedAt: saved.updatedAt.toISOString(),
            stale: saved.baseRevisionId !== variant.draftRevisionId,
          }
        : null,
    };
  }

  async save(actor: TrustedActor, input: unknown) {
    const values = checkpointSaveSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const { organizationId } = await this.scope.lock(
        actor,
        values.id,
        "cms.edit",
        tx,
      );
      const variant = await this.repository.variant(
        organizationId,
        values.id,
        values.locale,
        tx,
      );
      if (
        !variant?.draftRevisionId ||
        !(await this.repository.revision(
          variant.id,
          values.expectedRevisionId,
          tx,
        ))
      )
        throw new DomainError(
          "CONTENT_NOT_FOUND",
          "This page version is unavailable.",
          404,
        );
      // Validate current authority and content, while retaining the user's original base for conflict review.
      const { expectedCheckpointVersion, ...save } = values;
      const { draft } = await this.drafts.prepare(
        actor,
        { ...save, expectedRevisionId: variant.draftRevisionId },
        tx,
      );
      const [existing] = await tx
        .select()
        .from(cmsEditorCheckpoint)
        .where(
          and(
            eq(cmsEditorCheckpoint.actorId, actor.userId),
            eq(cmsEditorCheckpoint.variantId, variant.id),
          ),
        );
      if ((existing?.version ?? 0) !== expectedCheckpointVersion)
        throw new DomainError(
          "CHECKPOINT_CONFLICT",
          "Your recovery copy changed in another tab. Keep this editor open and review the saved copy.",
          409,
        );
      const document = {
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        socialImageId: draft.socialImageId,
        data: draft.data,
      };
      const [saved] = await tx
        .insert(cmsEditorCheckpoint)
        .values({
          actorId: actor.userId,
          organizationId,
          contentId: values.id,
          variantId: variant.id,
          baseRevisionId: values.expectedRevisionId,
          document,
          version: (existing?.version ?? 0) + 1,
        })
        .onConflictDoUpdate({
          target: [cmsEditorCheckpoint.actorId, cmsEditorCheckpoint.variantId],
          set: {
            baseRevisionId: values.expectedRevisionId,
            document,
            version: (existing?.version ?? 0) + 1,
            updatedAt: new Date(),
          },
        })
        .returning();
      await this.media.replaceUsage(
        `cms-checkpoint:${actor.userId}:${variant.id}`,
        organizationId,
        contentAssets(document.data, document.socialImageId),
        tx,
      );
      await new AlbumReader(this.db).replaceUsage(
        `cms-checkpoint:${actor.userId}:${variant.id}`,
        organizationId,
        contentAlbums(document.data),
        tx,
      );
      // Return this write's version while its scope lock is still held. A later
      // tab must not replace the receipt with a different checkpoint after commit.
      return {
        checkpoint: {
          document,
          baseRevisionId: saved.baseRevisionId,
          version: saved.version,
          updatedAt: saved.updatedAt.toISOString(),
          stale: saved.baseRevisionId !== variant.draftRevisionId,
        },
      };
    });
  }

  async discard(actor: TrustedActor, input: unknown) {
    const values = checkpointDiscardSchema.parse(input);
    await this.db.transaction(async (tx) => {
      const { organizationId } = await this.scope.lock(
        actor,
        values.id,
        "cms.edit",
        tx,
      );
      const variant = await this.repository.variant(
        organizationId,
        values.id,
        values.locale,
        tx,
      );
      if (!variant)
        throw new DomainError(
          "CONTENT_NOT_FOUND",
          "This page is unavailable.",
          404,
        );
      const removed = await tx
        .delete(cmsEditorCheckpoint)
        .where(
          and(
            eq(cmsEditorCheckpoint.actorId, actor.userId),
            eq(cmsEditorCheckpoint.variantId, variant.id),
            eq(cmsEditorCheckpoint.version, values.expectedCheckpointVersion),
          ),
        )
        .returning({ id: cmsEditorCheckpoint.variantId });
      if (!removed.length)
        throw new DomainError(
          "CHECKPOINT_CONFLICT",
          "The recovery copy changed. Reload its details before discarding it.",
          409,
        );
      await this.media.replaceUsage(
        `cms-checkpoint:${actor.userId}:${variant.id}`,
        organizationId,
        [],
        tx,
      );
      await new AlbumReader(this.db).replaceUsage(
        `cms-checkpoint:${actor.userId}:${variant.id}`,
        organizationId,
        [],
        tx,
      );
    });
    return { checkpoint: null };
  }
}
