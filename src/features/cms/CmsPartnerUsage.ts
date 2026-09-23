import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cmsContent, cmsRevision, cmsVariant } from "../../../db/schema/cms";
import { partner } from "../../../db/schema/partners";
import { partnerProfileSchema } from "../partners/partner_schemas";
import type { DatabaseExecutor } from "../../core/authorization/AuthorizationService";
import type { PartnerPlacement } from "../partners/partner_schemas";
import { EventPrizeReader } from "../events/EventPrizeReader";
import {
  contentPartners,
  dynamicProfileCategories,
  validateContent,
} from "./cms_validation";

/** CMS owns the reference query; disabled events retain their published selections. */
export class CmsPartnerUsage {
  async placements(
    organizationId: string,
    partnerId: string,
    executor: DatabaseExecutor,
  ): Promise<PartnerPlacement[]> {
    const rows = await executor
      .select({
        id: cmsContent.id,
        kind: cmsContent.kind,
        eventId: cmsContent.eventId,
        locale: cmsVariant.locale,
        title: cmsRevision.title,
        data: cmsRevision.data,
      })
      .from(cmsContent)
      .innerJoin(
        cmsVariant,
        and(
          eq(cmsVariant.contentId, cmsContent.id),
          eq(cmsVariant.organizationId, organizationId),
        ),
      )
      .innerJoin(
        cmsRevision,
        eq(cmsRevision.id, cmsVariant.publishedRevisionId),
      )
      .where(
        and(
          eq(cmsContent.organizationId, organizationId),
          isNull(cmsContent.archivedAt),
        ),
      );
    const [profile] = await executor
      .select({ draft: partner.draft, published: partner.published })
      .from(partner)
      .where(
        and(
          eq(partner.id, partnerId),
          eq(partner.organizationId, organizationId),
        ),
      );
    const categories = profile
      ? [profile.draft, profile.published]
          .filter(Boolean)
          .map((value) => partnerProfileSchema.parse(value).category)
      : [];
    const pages: PartnerPlacement[] = rows.flatMap((row) => {
      const data = validateContent(row.data, row.kind);
      const direct = contentPartners(data).includes(partnerId);
      const dynamic = dynamicProfileCategories(data).some(
        (category) =>
          category === "all" || categories.some((value) => value === category),
      );
      return direct || dynamic
        ? [
            {
              id: row.id,
              title: row.title,
              locale: row.locale,
              eventId: row.eventId,
              ...(!direct ? { dynamic: true } : {}),
            },
          ]
        : [];
    });
    const prizes = await new EventPrizeReader().placements(
      organizationId,
      partnerId,
      executor,
    );
    return [...pages, ...prizes];
  }
}
