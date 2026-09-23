import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { partner } from "../../../db/schema/partners";
import {
  DomainError,
  type DatabaseExecutor,
} from "../../core/authorization/AuthorizationService";
import { partnerProfileSchema, type PublicPartner } from "./partner_schemas";

/** Used by CMS reference checks and public projections; never returns a draft. */
export class PartnerReader {
  async assertReferences(
    organizationId: string,
    input: string[],
    published: boolean,
    executor: DatabaseExecutor,
  ) {
    const ids = [...new Set(z.array(z.uuid()).max(3200).parse(input))];
    if (!ids.length) return;
    const rows = await executor
      .select({ id: partner.id, published: partner.published })
      .from(partner)
      .where(
        and(
          eq(partner.organizationId, organizationId),
          inArray(partner.id, ids),
        ),
      );
    if (rows.length !== ids.length)
      throw new DomainError(
        "PARTNER_UNAVAILABLE",
        "Choose partners from this club's managed library. The selection has not been discarded.",
        422,
      );
    if (published && rows.some((row) => !row.published))
      throw new DomainError(
        "PARTNER_NOT_PUBLISHED",
        "Publish every selected partner profile in Partners & Sponsors before publishing this page.",
        422,
      );
  }

  async published(
    organizationId: string,
    executor: DatabaseExecutor,
    ids?: string[],
  ): Promise<PublicPartner[]> {
    if (ids && !ids.length) return [];
    const rows = await executor
      .select({ id: partner.id, profile: partner.published })
      .from(partner)
      .where(
        and(
          eq(partner.organizationId, organizationId),
          isNotNull(partner.published),
          ids ? inArray(partner.id, [...new Set(ids)]) : undefined,
        ),
      )
      .orderBy(partner.updatedAt);
    return rows.map((row) => ({
      id: row.id,
      ...partnerProfileSchema.parse(row.profile),
    }));
  }
}
