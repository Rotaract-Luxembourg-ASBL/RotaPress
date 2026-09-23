import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { cmsContent, cmsVariant } from "../../../db/schema/cms";
import { eventRevision } from "../../../db/schema/editorial-history";
import type {
  DatabaseExecutor,
  Transaction,
  TrustedActor,
} from "../../core/authorization/AuthorizationService";
import { cmsLocaleSchema } from "../cms/cms_schemas";
import { eventFields, type EventDraft } from "./event_schemas";

export const revisionPagesSchema = z
  .array(
    z.strictObject({
      id: z.uuid(),
      locale: cmsLocaleSchema,
      revisionId: z.uuid(),
    }),
  )
  .max(12);
export class EventRevisionWriter {
  async pages(
    executor: DatabaseExecutor,
    organizationId: string,
    eventId: string,
    published = false,
  ) {
    const rows = await executor
      .select({
        id: cmsContent.id,
        locale: cmsVariant.locale,
        revisionId: published
          ? cmsVariant.publishedRevisionId
          : cmsVariant.draftRevisionId,
      })
      .from(cmsContent)
      .innerJoin(cmsVariant, eq(cmsVariant.contentId, cmsContent.id))
      .where(
        and(
          eq(cmsContent.eventId, eventId),
          eq(cmsContent.organizationId, organizationId),
          isNull(cmsContent.archivedAt),
        ),
      );
    return revisionPagesSchema.parse(rows.filter((page) => page.revisionId));
  }

  async append(
    tx: Transaction,
    actor: TrustedActor,
    organizationId: string,
    event: EventDraft,
    action: typeof eventRevision.$inferInsert.action,
  ) {
    const pages = await this.pages(
      tx,
      organizationId,
      event.id,
      action === "published",
    );
    const [revision] = await tx
      .insert(eventRevision)
      .values({
        eventId: event.id,
        organizationId,
        eventVersion: event.version,
        action,
        fields: eventFields(event),
        pages,
        createdBy: actor.userId,
      })
      .returning({ id: eventRevision.id });
    return revision.id;
  }
}
