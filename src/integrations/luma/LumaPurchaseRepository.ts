import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import {
  lumaPurchaseIdentity,
  lumaPurchaseOrder,
  lumaPurchaseRefresh,
} from "../../../db/schema/luma-purchases";
import {
  DomainError,
  type DatabaseExecutor,
  type Transaction,
} from "../../core/authorization/AuthorizationService";
import type { ImportedPurchaseDetails } from "./purchase_schemas";

export type PurchaseRefreshRecord = typeof lumaPurchaseRefresh.$inferSelect;

/** Narrow evidence persistence. All callers already hold trusted event scope. */
export class LumaPurchaseRepository {
  async latest(
    db: DatabaseExecutor,
    organizationId: string,
    guestId: string,
    successful = false,
  ) {
    const [row] = await db
      .select()
      .from(lumaPurchaseRefresh)
      .where(
        and(
          eq(lumaPurchaseRefresh.organizationId, organizationId),
          eq(lumaPurchaseRefresh.guestId, guestId),
          successful ? eq(lumaPurchaseRefresh.status, "succeeded") : undefined,
        ),
      )
      .orderBy(desc(lumaPurchaseRefresh.version))
      .limit(1);
    return row;
  }

  async request(
    db: DatabaseExecutor,
    organizationId: string,
    requestId: string,
  ) {
    const [row] = await db
      .select()
      .from(lumaPurchaseRefresh)
      .where(
        and(
          eq(lumaPurchaseRefresh.organizationId, organizationId),
          eq(lumaPurchaseRefresh.requestId, requestId),
        ),
      );
    return row;
  }

  async start(
    tx: Transaction,
    values: typeof lumaPurchaseRefresh.$inferInsert,
  ) {
    const [row] = await tx
      .insert(lumaPurchaseRefresh)
      .values(values)
      .returning();
    return row;
  }

  async identityHeld(
    db: DatabaseExecutor,
    organizationId: string,
    guestId: string,
    sinceVersion: number,
  ) {
    const [row] = await db
      .select({ id: lumaPurchaseRefresh.id })
      .from(lumaPurchaseRefresh)
      .where(
        and(
          eq(lumaPurchaseRefresh.organizationId, organizationId),
          eq(lumaPurchaseRefresh.guestId, guestId),
          eq(lumaPurchaseRefresh.failureCode, "identity_changed"),
          gt(lumaPurchaseRefresh.version, sinceVersion),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async fail(
    db: DatabaseExecutor,
    id: string,
    failureCode: "refresh_failed" | "identity_changed" = "refresh_failed",
  ) {
    await db
      .update(lumaPurchaseRefresh)
      .set({ status: "failed", failureCode, finishedAt: new Date() })
      .where(
        and(
          eq(lumaPurchaseRefresh.id, id),
          eq(lumaPurchaseRefresh.status, "running"),
        ),
      );
  }

  async complete(
    tx: Transaction,
    row: PurchaseRefreshRecord,
    details: ImportedPurchaseDetails,
  ) {
    const scope = {
      guestId: row.guestId,
      sourceId: row.sourceId,
      eventId: row.eventId,
      organizationId: row.organizationId,
    };
    await tx
      .insert(lumaPurchaseIdentity)
      .values({ ...scope, providerUserId: details.providerUserId })
      .onConflictDoNothing();
    const [identity] = await tx
      .select()
      .from(lumaPurchaseIdentity)
      .where(eq(lumaPurchaseIdentity.guestId, row.guestId));
    if (identity?.providerUserId !== details.providerUserId)
      throw new DomainError(
        "PURCHASE_IDENTITY_CHANGED",
        "The provider identity changed. Retained purchase evidence is unchanged.",
        409,
      );
    for (const order of details.orders) {
      await tx
        .insert(lumaPurchaseOrder)
        .values({ ...scope, providerOrderId: order.providerOrderId })
        .onConflictDoNothing();
      const [owner] = await tx
        .select({ guestId: lumaPurchaseOrder.guestId })
        .from(lumaPurchaseOrder)
        .where(
          and(
            eq(lumaPurchaseOrder.sourceId, row.sourceId),
            eq(lumaPurchaseOrder.providerOrderId, order.providerOrderId),
          ),
        );
      if (owner?.guestId !== row.guestId)
        throw new DomainError(
          "PURCHASE_OWNERSHIP_CHANGED",
          "A provider order belongs to a different guest. Retained evidence is unchanged.",
          409,
        );
    }
    await tx
      .update(lumaPurchaseRefresh)
      .set({ status: "succeeded", finishedAt: new Date(), snapshot: details })
      .where(
        and(
          eq(lumaPurchaseRefresh.id, row.id),
          eq(lumaPurchaseRefresh.status, "running"),
        ),
      );
  }
}
