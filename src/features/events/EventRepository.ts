import "server-only";
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
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
import { collectionPage, searchPattern } from "@/core/collections";
import type { EventCollectionQuery } from "./event_collection";

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

  async query(
    organizationId: string,
    input: EventCollectionQuery,
    managerUserId?: string,
  ) {
    return this.db.transaction(
      async (tx) => {
        const assignment = alias(eventManager, "collection_assignment");
        const scope = and(
          eq(clubEvent.organizationId, organizationId),
          managerUserId
            ? exists(
                tx
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
        );
        const active = isNull(clubEvent.archivedAt);
        const notCancelled = isNull(clubEvent.cancelledAt);
        const now = new Date();
        const predicates = {
          all: undefined,
          active,
          published: and(
            active,
            notCancelled,
            isNotNull(clubEvent.publishedAt),
          ),
          draft: and(active, notCancelled, isNull(clubEvent.publishedAt)),
          cancelled: and(active, isNotNull(clubEvent.cancelledAt)),
          archived: isNotNull(clubEvent.archivedAt),
          upcoming: and(active, notCancelled, gte(clubEvent.startsAt, now)),
        };
        const where = and(
          scope,
          predicates[input.status],
          input.search
            ? ilike(clubEvent.title, searchPattern(input.search))
            : undefined,
          input.timing === "upcoming"
            ? and(notCancelled, gte(clubEvent.startsAt, now))
            : input.timing === "past"
              ? lt(clubEvent.startsAt, now)
              : undefined,
        );
        const [matched] = await tx
          .select({ total: count() })
          .from(clubEvent)
          .where(where);
        const [counts] = await tx
          .select({
            all: count(),
            active:
              sql<number>`count(*) filter (where ${predicates.active})`.mapWith(
                Number,
              ),
            published:
              sql<number>`count(*) filter (where ${predicates.published})`.mapWith(
                Number,
              ),
            draft:
              sql<number>`count(*) filter (where ${predicates.draft})`.mapWith(
                Number,
              ),
            cancelled:
              sql<number>`count(*) filter (where ${predicates.cancelled})`.mapWith(
                Number,
              ),
            archived:
              sql<number>`count(*) filter (where ${predicates.archived})`.mapWith(
                Number,
              ),
            upcoming:
              sql<number>`count(*) filter (where ${predicates.upcoming})`.mapWith(
                Number,
              ),
          })
          .from(clubEvent)
          .where(scope);
        const page = collectionPage(matched.total, input.page, input.pageSize);
        const rows = await tx
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
          .where(where)
          .orderBy(
            input.sort === "title"
              ? clubEvent.title
              : input.sort === "starts"
                ? clubEvent.startsAt
                : desc(clubEvent.createdAt),
            clubEvent.id,
          )
          .limit(input.pageSize)
          .offset(input.offset ?? (page - 1) * input.pageSize);
        return {
          events: rows.map(dto),
          total: matched.total,
          page,
          pageSize: input.pageSize,
          counts,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async responseEventIds(
    organizationId: string,
    userId?: string,
    executor: DatabaseExecutor = this.db,
  ) {
    if (!userId)
      return (
        await executor
          .select({ id: clubEvent.id })
          .from(clubEvent)
          .where(eq(clubEvent.organizationId, organizationId))
      ).map((row) => row.id);
    const rows = await executor
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
