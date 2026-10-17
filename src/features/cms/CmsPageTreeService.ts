import "server-only";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { cmsContent } from "../../../db/schema/cms";
import { cmsPagePlacement } from "../../../db/schema/cms-workspace";
import {
  AuthorizationService,
  DomainError,
  type Transaction,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import type { CmsService } from "./CmsService";
import { CmsRepository } from "./CmsRepository";
import { pageMoveSchema } from "./cms_workspace_schemas";

/** Sibling reordering uses the canonical hierarchy and draft writer in one transaction. */
export class CmsPageTreeService {
  constructor(
    private readonly db: Database,
    private readonly authorization: AuthorizationService,
    private readonly cms: CmsService,
  ) {}

  async move(actor: TrustedActor, input: unknown, executor?: Transaction) {
    const values = pageMoveSchema.parse(input);
    const apply = async (tx: Transaction) => {
      const { organizationId } = await this.authorization.lock(
        actor,
        "cms.edit",
        tx,
      );
      const repository = new CmsRepository(this.db);
      const content = await repository.content(organizationId, values.id, tx);
      const variant = await repository.variant(
        organizationId,
        values.id,
        values.locale,
        tx,
      );
      const revision =
        variant &&
        (await repository.revision(variant.id, values.expectedRevisionId, tx));
      if (!content || content.kind !== "page" || content.eventId || !revision)
        throw new DomainError(
          "PAGE_UNAVAILABLE",
          "Choose an available website page.",
          404,
        );
      const siblings = await tx
        .select({
          id: cmsContent.id,
          position: cmsPagePlacement.position,
          version: cmsPagePlacement.version,
        })
        .from(cmsContent)
        .leftJoin(
          cmsPagePlacement,
          eq(cmsPagePlacement.contentId, cmsContent.id),
        )
        .where(
          and(
            eq(cmsContent.organizationId, organizationId),
            eq(cmsContent.kind, "page"),
            isNull(cmsContent.eventId),
            isNull(cmsContent.archivedAt),
            ne(cmsContent.id, values.id),
            values.parentId
              ? eq(cmsPagePlacement.parentId, values.parentId)
              : isNull(cmsPagePlacement.parentId),
          ),
        )
        .orderBy(
          asc(sql`coalesce(${cmsPagePlacement.position}, 0)`),
          asc(cmsContent.id),
        );
      const at = values.beforeId
        ? siblings.findIndex((row) => row.id === values.beforeId)
        : siblings.length;
      if (
        at < 0 ||
        (values.beforeId &&
          (siblings[at].version ?? 0) !== values.expectedBeforeVersion)
      )
        throw new DomainError(
          "PAGE_ORDER_CHANGED",
          "The destination page moved. Refresh the tree and try again.",
          409,
        );
      const moved = await this.cms.workspace.quickEditDraft(
        actor,
        {
          id: values.id,
          locale: values.locale,
          expectedRevisionId: values.expectedRevisionId,
          expectedPlacementVersion: values.expectedPlacementVersion,
          parentId: values.parentId,
          position: at,
          title: revision.title,
          slug: revision.slug,
        },
        tx,
      );
      const changed = siblings.flatMap((row, index) => {
        const position = index < at ? index : index + 1;
        return (row.position ?? 0) === position
          ? []
          : [
              {
                contentId: row.id,
                organizationId,
                parentId: values.parentId,
                position,
                version: (row.version ?? 0) + 1,
              },
            ];
      });
      // The organization lock serializes moves, so these versions are the exact current sibling versions.
      for (const row of changed)
        await tx
          .insert(cmsPagePlacement)
          .values(row)
          .onConflictDoUpdate({
            target: cmsPagePlacement.contentId,
            set: { position: row.position, version: row.version },
          });
      return { ...moved, parentId: values.parentId, position: at };
    };
    return executor ? apply(executor) : this.db.transaction(apply);
  }
}
