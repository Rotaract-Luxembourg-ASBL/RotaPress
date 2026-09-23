import "server-only";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { cmsRevision, cmsVariant } from "../../../db/schema/cms";
import type {
  Transaction,
  TrustedActor,
} from "../../core/authorization/AuthorizationService";
import type { MediaService } from "../media/MediaService";
import type { CmsLocale, revisionInputSchema } from "./cms_schemas";
import { contentAssets } from "./cms_validation";

/** Immutable revision persistence and media retention shared by pages and site parts. */
export class CmsRevisionWriter {
  constructor(private readonly media: MediaService) {}
  async createVariant(
    tx: Transaction,
    actor: TrustedActor,
    organizationId: string,
    id: string,
    locale: CmsLocale,
    draft: z.infer<typeof revisionInputSchema>,
  ) {
    const [variant] = await tx
      .insert(cmsVariant)
      .values({ organizationId, contentId: id, locale })
      .returning();
    await this.appendRevision(tx, actor, organizationId, variant.id, draft);
  }

  async appendRevision(
    tx: Transaction,
    actor: TrustedActor,
    organizationId: string,
    variantId: string,
    draft: z.infer<typeof revisionInputSchema>,
  ) {
    const [revision] = await tx
      .insert(cmsRevision)
      .values({
        variantId,
        createdBy: actor.userId,
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        socialImageId: draft.socialImageId,
        data: draft.data,
      })
      .returning();
    await tx
      .update(cmsVariant)
      .set({ draftRevisionId: revision.id })
      .where(eq(cmsVariant.id, variantId));
    await this.media.replaceUsage(
      `cms-revision:${revision.id}`,
      organizationId,
      contentAssets(draft.data, draft.socialImageId),
      tx,
    );
  }
}
