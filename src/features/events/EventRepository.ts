import "server-only";
import { and, desc, eq, exists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { user } from "../../../db/schema/auth";
import { membership } from "../../../db/schema/club";
import { clubEvent, eventManager } from "../../../db/schema/events";
import type {
  DatabaseExecutor,
  Transaction,
} from "../../core/authorization/AuthorizationService";
import type { Database } from "../../infrastructure/database/client";
import type { EventSummary } from "./event_schemas";

// This repository serves authorized event staff; public event fields omit people.
const staffDisplayName = sql<string>`coalesce(nullif(${user.name}, ''), ${user.email})`;
const projection = {
  id: clubEvent.id,
  slug: clubEvent.slug,
  featured: clubEvent.featured,
  title: clubEvent.title,
  description: clubEvent.description,
  startsAt: clubEvent.startsAt,
  endsAt: clubEvent.endsAt,
  timezone: clubEvent.timezone,
  venue: clubEvent.venue,
  visibility: clubEvent.visibility,
  version: clubEvent.version,
  published: clubEvent.publishedAt,
  archivedAt: clubEvent.archivedAt,
  cancelledAt: clubEvent.cancelledAt,
  updatedAt: clubEvent.updatedAt,
  manager: { userId: user.id, name: staffDisplayName },
};
function dto(
  row: Omit<
    EventSummary,
    "startsAt" | "endsAt" | "updatedAt" | "archived" | "published" | "cancelled"
  > & {
    published: Date | null;
    startsAt: Date;
    endsAt: Date | null;
    updatedAt: Date;
    archivedAt: Date | null;
    cancelledAt: Date | null;
  },
): EventSummary {
  const { archivedAt, cancelledAt, ...value } = row;
  return {
    ...value,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    archived: archivedAt !== null,
    cancelled: cancelledAt !== null,
    published: row.published !== null,
  };
}
export class EventRepository {
  constructor(private readonly db: Database) {}

  async responseEventIds(organizationId: string, userId?: string) {
    if (!userId)
      return (
        await this.db
          .select({ id: clubEvent.id })
          .from(clubEvent)
          .where(eq(clubEvent.organizationId, organizationId))
      ).map((row) => row.id);
    const rows = await this.db
      .select({ id: eventManager.eventId, role: eventManager.role })
      .from(eventManager)
      .where(
        and(
          eq(eventManager.organizationId, organizationId),
          eq(eventManager.userId, userId),
        ),
      );
    return rows;
  }

  async list(organizationId: string, managerUserId?: string) {
    const assignment = alias(eventManager, "current_event_assignment");
    const rows = await this.db
      .select(projection)
      .from(clubEvent)
      .leftJoin(
        eventManager,
        and(
          eq(eventManager.eventId, clubEvent.id),
          eq(eventManager.organizationId, clubEvent.organizationId),
          eq(eventManager.role, "manager"),
        ),
      )
      .leftJoin(user, eq(user.id, eventManager.userId))
      .where(
        and(
          eq(clubEvent.organizationId, organizationId),
          managerUserId
            ? exists(
                this.db
                  .select({ id: assignment.eventId })
                  .from(assignment)
                  .where(
                    and(
                      eq(assignment.eventId, clubEvent.id),
                      eq(assignment.organizationId, organizationId),
                      eq(assignment.userId, managerUserId),
                    ),
                  ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(clubEvent.createdAt));
    return rows.map(dto);
  }

  async detail(
    id: string,
    organizationId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select(projection)
      .from(clubEvent)
      .leftJoin(
        eventManager,
        and(
          eq(eventManager.eventId, clubEvent.id),
          eq(eventManager.organizationId, clubEvent.organizationId),
          eq(eventManager.role, "manager"),
        ),
      )
      .leftJoin(user, eq(user.id, eventManager.userId))
      .where(
        and(eq(clubEvent.id, id), eq(clubEvent.organizationId, organizationId)),
      );
    return row ? dto(row) : null;
  }

  async managers(organizationId: string) {
    return this.db
      .select({ userId: user.id, name: staffDisplayName })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(
        and(
          eq(membership.organizationId, organizationId),
          eq(membership.status, "approved"),
        ),
      );
  }

  async approvedManager(
    organizationId: string,
    userId: string,
    tx: Transaction,
  ) {
    const [row] = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(
        and(
          eq(membership.organizationId, organizationId),
          eq(membership.userId, userId),
          eq(membership.status, "approved"),
        ),
      );
    return Boolean(row);
  }

  async hasAssignment(organizationId: string, userId: string) {
    const [row] = await this.db
      .select({ id: clubEvent.id })
      .from(eventManager)
      .innerJoin(
        clubEvent,
        and(
          eq(eventManager.eventId, clubEvent.id),
          eq(eventManager.organizationId, clubEvent.organizationId),
        ),
      )
      .where(
        and(
          eq(eventManager.organizationId, organizationId),
          eq(eventManager.userId, userId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async insert(
    input: typeof clubEvent.$inferInsert,
    managerUserId: string,
    tx: Transaction,
  ) {
    const [event] = await tx
      .insert(clubEvent)
      .values(input)
      .returning({ id: clubEvent.id });
    await tx.insert(eventManager).values({
      eventId: event.id,
      organizationId: input.organizationId,
      userId: managerUserId,
    });
    return event.id;
  }

  async assignManager(
    id: string,
    organizationId: string,
    userId: string,
    tx: Transaction,
  ) {
    await tx
      .delete(eventManager)
      .where(
        and(
          eq(eventManager.eventId, id),
          eq(eventManager.organizationId, organizationId),
          eq(eventManager.role, "manager"),
        ),
      );
    await tx
      .insert(eventManager)
      .values({ eventId: id, organizationId, userId, role: "manager" })
      .onConflictDoUpdate({
        target: [eventManager.eventId, eventManager.userId],
        set: { role: "manager" },
      });
  }

  async role(
    id: string,
    organizationId: string,
    userId: string,
    executor: DatabaseExecutor = this.db,
  ) {
    const [row] = await executor
      .select({ role: eventManager.role })
      .from(eventManager)
      .where(
        and(
          eq(eventManager.eventId, id),
          eq(eventManager.organizationId, organizationId),
          eq(eventManager.userId, userId),
        ),
      );
    return row?.role;
  }

  async team(id: string, organizationId: string) {
    return this.db
      .select({
        userId: user.id,
        name: staffDisplayName,
        role: eventManager.role,
        status: membership.status,
      })
      .from(eventManager)
      .innerJoin(user, eq(user.id, eventManager.userId))
      .innerJoin(
        membership,
        and(
          eq(membership.organizationId, eventManager.organizationId),
          eq(membership.userId, eventManager.userId),
        ),
      )
      .where(
        and(
          eq(eventManager.eventId, id),
          eq(eventManager.organizationId, organizationId),
        ),
      )
      .orderBy(staffDisplayName);
  }

  async changeEditor(
    id: string,
    organizationId: string,
    userId: string,
    operation: "grant" | "revoke",
    tx: Transaction,
    role: "editor" | "registration-manager",
  ) {
    if (operation === "grant")
      await tx
        .insert(eventManager)
        .values({ eventId: id, organizationId, userId, role })
        .onConflictDoNothing();
    else
      await tx
        .delete(eventManager)
        .where(
          and(
            eq(eventManager.eventId, id),
            eq(eventManager.organizationId, organizationId),
            eq(eventManager.userId, userId),
            eq(eventManager.role, role),
          ),
        );
  }

  async update(
    id: string,
    organizationId: string,
    values: Partial<typeof clubEvent.$inferInsert>,
    tx: Transaction,
  ) {
    await tx
      .update(clubEvent)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(eq(clubEvent.id, id), eq(clubEvent.organizationId, organizationId)),
      );
  }
}
