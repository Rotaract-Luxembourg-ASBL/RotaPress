import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { eventPackage } from "../../../db/schema/event-packages";
import type { Transaction } from "../../core/authorization/AuthorizationService";
import { packageDraftSchema, type PackageDraft } from "./package_schemas";

export type PackageCopy = { id: string; version: number; draft: PackageDraft };

/** Copy local editorial values only. Each new event reviews its own sources and publication. */
export class EventPackageCopyService {
  async snapshot(
    organizationId: string,
    eventId: string,
    tx: Transaction,
  ): Promise<PackageCopy[]> {
    const rows = await tx
      .select()
      .from(eventPackage)
      .where(
        and(
          eq(eventPackage.organizationId, organizationId),
          eq(eventPackage.eventId, eventId),
        ),
      )
      .orderBy(asc(eventPackage.id));
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      draft: { ...packageDraftSchema.parse(row.draft), checkoutEnabled: false },
    }));
  }

  async createDrafts(
    organizationId: string,
    eventId: string,
    packages: PackageCopy[],
    tx: Transaction,
  ) {
    if (!packages.length) return;
    await tx.insert(eventPackage).values(
      packages.map((item) => ({
        organizationId,
        eventId,
        sourceId: null,
        draft: { ...item.draft, checkoutEnabled: false },
      })),
    );
  }
}
