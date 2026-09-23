import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { installation, organization } from "../../../db/schema/club";
import { clubEvent } from "../../../db/schema/events";
import { guestAccess } from "../../../db/schema/guest-access";
import {
  DomainError,
  type DatabaseExecutor,
  type Transaction,
  type TrustedActor,
} from "../../core/authorization/AuthorizationService";

export type GuestGrant = typeof guestAccess.$inferSelect;

/** All grant reads stay inside the installed organization. Mutations share its lifecycle lock. */
export class GuestGrantRepository {
  async installed(tx: Transaction, write = false) {
    const [installed] = await tx
      .select({ id: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    if (!installed?.id)
      throw new DomainError("NOT_INSTALLED", "This site is unavailable.", 404);
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, installed.id))
      .for(write ? "update" : "share");
    return installed.id;
  }

  async event(db: DatabaseExecutor, organizationId: string, eventId: string) {
    const [event] = await db
      .select({
        published: clubEvent.published,
        publishedAt: clubEvent.publishedAt,
        archivedAt: clubEvent.archivedAt,
        cancelledAt: clubEvent.cancelledAt,
      })
      .from(clubEvent)
      .where(
        and(
          eq(clubEvent.organizationId, organizationId),
          eq(clubEvent.id, eventId),
        ),
      );
    return event;
  }

  async get(
    db: DatabaseExecutor,
    organizationId: string,
    eventId: string,
    id: string,
  ) {
    const [row] = await db
      .select()
      .from(guestAccess)
      .where(
        and(
          eq(guestAccess.organizationId, organizationId),
          eq(guestAccess.eventId, eventId),
          eq(guestAccess.id, id),
        ),
      );
    return row;
  }

  list(db: DatabaseExecutor, organizationId: string, eventId: string) {
    return db
      .select()
      .from(guestAccess)
      .where(
        and(
          eq(guestAccess.organizationId, organizationId),
          eq(guestAccess.eventId, eventId),
        ),
      )
      .orderBy(desc(guestAccess.createdAt))
      .limit(201);
  }

  mine(db: DatabaseExecutor, organizationId: string, actor: TrustedActor) {
    return db
      .select()
      .from(guestAccess)
      .where(
        and(
          eq(guestAccess.organizationId, organizationId),
          isNull(guestAccess.revokedAt),
          or(
            eq(guestAccess.claimedBy, actor.userId),
            and(
              isNull(guestAccess.claimedBy),
              eq(guestAccess.recipientEmail, actor.email.trim().toLowerCase()),
            ),
          ),
        ),
      )
      .orderBy(desc(guestAccess.createdAt))
      .limit(100);
  }

  async activeSource(
    db: DatabaseExecutor,
    organizationId: string,
    eventId: string,
    source: "native" | "luma",
    sourceId: string,
  ) {
    const [row] = await db
      .select()
      .from(guestAccess)
      .where(
        and(
          eq(guestAccess.organizationId, organizationId),
          eq(guestAccess.eventId, eventId),
          isNull(guestAccess.revokedAt),
          eq(
            source === "native"
              ? guestAccess.registrationId
              : guestAccess.lumaGuestId,
            sourceId,
          ),
        ),
      );
    return row;
  }

  async insert(tx: Transaction, values: typeof guestAccess.$inferInsert) {
    const [row] = await tx.insert(guestAccess).values(values).returning();
    return row;
  }

  async update(
    tx: Transaction,
    row: GuestGrant,
    values: Partial<Pick<GuestGrant, "claimedBy" | "claimedAt" | "revokedAt">>,
  ) {
    const [updated] = await tx
      .update(guestAccess)
      .set({ ...values, version: row.version + 1 })
      .where(
        and(
          eq(guestAccess.id, row.id),
          eq(guestAccess.organizationId, row.organizationId),
          eq(guestAccess.eventId, row.eventId),
          eq(guestAccess.version, row.version),
        ),
      )
      .returning();
    if (!updated)
      throw new DomainError(
        "GUEST_CONFLICT",
        "Guest access changed. Refresh and try again.",
        409,
      );
    return updated;
  }
}
