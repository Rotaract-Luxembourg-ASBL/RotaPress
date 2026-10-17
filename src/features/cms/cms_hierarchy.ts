import { and, eq, sql } from "drizzle-orm";
import { cmsPagePlacement } from "../../../db/schema/cms-workspace";
import type { Transaction } from "../../core/authorization/AuthorizationService";

/** Every archive entry point uses this under the organization's mutation lock. */
export async function detachPageChildren(
  tx: Transaction,
  organizationId: string,
  parentId: string,
) {
  await tx
    .update(cmsPagePlacement)
    .set({ parentId: null, version: sql`${cmsPagePlacement.version} + 1` })
    .where(
      and(
        eq(cmsPagePlacement.organizationId, organizationId),
        eq(cmsPagePlacement.parentId, parentId),
      ),
    );
}
