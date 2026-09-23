import "server-only";
import { AuditRepository } from "../../core/audit/AuditRepository";
import {
  DomainError,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";
import { CmsRepository } from "./CmsRepository";
import { CmsScopePolicy } from "./CmsScopePolicy";
import { CmsReferencePolicy } from "./CmsReferencePolicy";
import { CmsRevisionWriter } from "./CmsRevisionWriter";
import { MediaService } from "../media/MediaService";
import { saveInput, restoreInput } from "./cms_commands";
import { contentAssets, revisionDto, validateContent } from "./cms_validation";

/** The same validation governs saved drafts, event restoration and unsaved previews. */
export class CmsDraftService {
  constructor(
    private readonly repository: CmsRepository,
    private readonly scope: CmsScopePolicy,
    private readonly references: CmsReferencePolicy,
    private readonly revisions: CmsRevisionWriter,
    private readonly media: MediaService,
  ) {}

  async prepare(actor: TrustedActor, input: unknown, tx: Transaction) {
    const parsed = saveInput.parse(input);
    const { organizationId } = await this.scope.lock(
      actor,
      parsed.id,
      "cms.edit",
      tx,
    );
    const content = await this.repository.content(
      organizationId,
      parsed.id,
      tx,
    );
    const variant = await this.repository.variant(
      organizationId,
      parsed.id,
      parsed.locale,
      tx,
    );
    if (!content || !variant)
      throw new DomainError(
        "CONTENT_NOT_FOUND",
        "This content is unavailable.",
        404,
      );
    if (content.archivedAt)
      throw new DomainError(
        "CONTENT_ARCHIVED",
        "Archived content is read-only.",
        409,
      );
    if (variant.draftRevisionId !== parsed.expectedRevisionId)
      throw new DomainError(
        "REVISION_CONFLICT",
        "Another editor saved this draft. Your changes are preserved; reload before saving again.",
        409,
      );
    const data = validateContent(parsed.data, content.kind);
    await this.scope.validate(content, data, parsed.socialImageId, tx);
    await this.references.validateReferences(
      organizationId,
      data,
      parsed.locale,
      false,
      tx,
      content.eventId,
    );
    await this.media.assertOwnedAssets(
      organizationId,
      contentAssets(data, parsed.socialImageId),
      tx,
    );
    return { organizationId, content, variant, draft: { ...parsed, data } };
  }

  async save(
    actor: TrustedActor,
    input: unknown,
    tx: Transaction,
    action = "cms.draft.saved",
  ) {
    const { organizationId, variant, draft } = await this.prepare(
      actor,
      input,
      tx,
    );
    await this.revisions.appendRevision(
      tx,
      actor,
      organizationId,
      variant.id,
      draft,
    );
    await new AuditRepository().record(tx, {
      organizationId,
      actorUserId: actor.userId,
      action,
      targetId: draft.id,
    });
  }

  async restore(actor: TrustedActor, input: unknown, tx: Transaction) {
    const parsed = restoreInput.parse(input);
    const { organizationId } = await this.scope.lock(
      actor,
      parsed.id,
      "cms.edit",
      tx,
    );
    const content = await this.repository.content(
      organizationId,
      parsed.id,
      tx,
    );
    const variant = await this.repository.variant(
      organizationId,
      parsed.id,
      parsed.locale,
      tx,
    );
    const revision = variant
      ? await this.repository.revision(variant.id, parsed.revisionId, tx)
      : null;
    if (!content || !revision)
      throw new DomainError(
        "CONTENT_NOT_FOUND",
        "This revision is unavailable.",
        404,
      );
    const draft = revisionDto(revision, content.kind);
    await this.save(
      actor,
      {
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        socialImageId: draft.socialImageId,
        data: draft.data,
        id: parsed.id,
        locale: parsed.locale,
        expectedRevisionId: parsed.expectedRevisionId,
      },
      tx,
      "cms.draft.restored",
    );
  }
}
