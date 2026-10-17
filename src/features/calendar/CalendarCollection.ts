import "server-only";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { calendarSchedule } from "../../../db/schema/calendar";
import { collectionPage, searchPattern } from "@/core/collections";
import type { Database } from "@/infrastructure/database/client";
import { scheduleSchema } from "./calendar_schemas";
import { calendarActivityQuerySchema } from "./calendar_collection";

export class CalendarCollection {
  constructor(private readonly db: Database) {}
  async schedules(organizationId: string, raw: unknown) {
    const input = calendarActivityQuerySchema.parse(raw);
    return this.db.transaction(
      async (tx) => {
        const scope = and(
          eq(calendarSchedule.organizationId, organizationId),
          input.calendarId
            ? eq(calendarSchedule.calendarId, input.calendarId)
            : undefined,
        );
        const active = eq(calendarSchedule.archived, false);
        const predicates = {
          all: undefined,
          active,
          published: and(active, isNotNull(calendarSchedule.published)),
          draft: and(active, isNull(calendarSchedule.published)),
          archived: eq(calendarSchedule.archived, true),
        };
        const where = and(
          scope,
          predicates[input.status],
          input.search
            ? ilike(
                sql`${calendarSchedule.draft}->>'title'`,
                searchPattern(input.search),
              )
            : undefined,
        );
        const [matched] = await tx
          .select({ total: count() })
          .from(calendarSchedule)
          .where(where);
        const [counts] = await tx
          .select({
            all: count(),
            active: sql<number>`count(*) filter (where ${active})`.mapWith(
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
            archived:
              sql<number>`count(*) filter (where ${predicates.archived})`.mapWith(
                Number,
              ),
          })
          .from(calendarSchedule)
          .where(scope);
        const page = collectionPage(matched.total, input.page, input.pageSize);
        const rows = await tx
          .select()
          .from(calendarSchedule)
          .where(where)
          .orderBy(desc(calendarSchedule.updatedAt), calendarSchedule.id)
          .limit(input.pageSize)
          .offset(input.offset ?? (page - 1) * input.pageSize);
        return {
          items: rows.map((row) => ({
            id: row.id,
            calendarId: row.calendarId,
            draft: scheduleSchema.parse(row.draft),
            published: row.published
              ? scheduleSchema.parse(row.published)
              : null,
            version: row.version,
            archived: row.archived,
          })),
          counts,
          total: matched.total,
          page,
          pageSize: input.pageSize,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
