import "server-only";
import type {
  AuthorizationService,
  DatabaseExecutor,
  TrustedActor,
} from "@/core/authorization/AuthorizationService";
import { DomainError } from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import { FormRepository } from "./FormRepository";
import type { FormDefinition } from "./form_types";

export type FormPublicationReview = {
  id: string;
  title: string;
  definition: FormDefinition | null;
  expectedRevision: number | null;
  publishedVersionNumber: number | null;
  status: "draft" | "changes" | "published" | "unavailable";
  canPublish: boolean;
};

/** Publication guidance includes questions only, never answers or notification settings. */
export class FormPublicationReviewService {
  private readonly repository: FormRepository;
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
  ) {
    this.repository = new FormRepository(db);
  }

  async read(
    actor: TrustedActor,
    ids: string[],
    executor: DatabaseExecutor = this.db,
  ): Promise<FormPublicationReview[]> {
    const scope = await this.authorization.require(
      actor,
      "cms.publish",
      executor,
    );
    const canPublish =
      scope.capabilities.includes("forms.edit") &&
      (await this.authorization.features.enabled(
        scope.organizationId,
        "forms",
        executor,
      ));
    const result: FormPublicationReview[] = [];
    for (const id of new Set(ids)) {
      const unavailable: FormPublicationReview = {
        id,
        title: "Unavailable form",
        definition: null,
        expectedRevision: null,
        publishedVersionNumber: null,
        status: "unavailable",
        canPublish: false,
      };
      try {
        const row = await this.repository.owned(
          id,
          scope.organizationId,
          executor,
        );
        if (row.eventId || row.archived) {
          result.push(unavailable);
          continue;
        }
        const detail = await this.repository.dto(row, executor);
        result.push({
          id,
          title: canPublish ? detail.draft.title : "Referenced form",
          definition: canPublish ? detail.draft : null,
          expectedRevision: canPublish ? detail.draftRevision : null,
          publishedVersionNumber: detail.publishedVersionNumber,
          status: !detail.publishedVersionId
            ? "draft"
            : detail.publishedVersionNumber !== detail.draftRevision
              ? "changes"
              : "published",
          canPublish,
        });
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "FORM_NOT_FOUND")
          throw error;
        result.push(unavailable);
      }
    }
    return result;
  }
}
