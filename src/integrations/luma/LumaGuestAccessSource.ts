import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { lumaGuestProjection } from "../../../db/schema/luma-sync";
import { eventPackageSource } from "../../../db/schema/event-packages";
import type { DatabaseExecutor } from "../../core/authorization/AuthorizationService";
import type { GuestSource } from "../../features/events/guest_sources";

/** Imported data is a candidate for a deliberate local grant, never authority by itself. */
export class LumaGuestAccessSource {
  async guestSources(
    org: string,
    eventId: string,
    db: DatabaseExecutor,
    id?: string,
  ): Promise<GuestSource[]> {
    const rows = await db
      .select({
        id: lumaGuestProjection.id,
        sourceId: lumaGuestProjection.sourceId,
        sourceLabel: eventPackageSource.label,
        name: lumaGuestProjection.name,
        email: lumaGuestProjection.email,
        status: lumaGuestProjection.approvalStatus,
        present: lumaGuestProjection.present,
        observedAt: lumaGuestProjection.observedAt,
      })
      .from(lumaGuestProjection)
      .innerJoin(
        eventPackageSource,
        and(
          eq(eventPackageSource.id, lumaGuestProjection.sourceId),
          eq(eventPackageSource.eventId, lumaGuestProjection.eventId),
          eq(
            eventPackageSource.organizationId,
            lumaGuestProjection.organizationId,
          ),
        ),
      )
      .where(
        and(
          eq(lumaGuestProjection.organizationId, org),
          eq(lumaGuestProjection.eventId, eventId),
          id ? eq(lumaGuestProjection.id, id) : undefined,
        ),
      )
      .orderBy(desc(lumaGuestProjection.observedAt), lumaGuestProjection.id)
      .limit(201);
    return rows.map((row) => ({
      kind: "luma",
      id: row.id,
      sourceId: row.sourceId,
      sourceLabel: row.sourceLabel,
      userId: null,
      name: row.name ?? "Guest",
      email: row.email,
      status: row.status,
      available: row.present && row.status !== "declined",
      observedAt: row.observedAt.toISOString(),
    }));
  }
}
