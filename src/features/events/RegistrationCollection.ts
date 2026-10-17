import "server-only";
import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { user } from "../../../db/schema/auth";
import { eventRegistration } from "../../../db/schema/registrations";
import {
  collectionPage,
  collectionQuerySchema,
  searchPattern,
} from "@/core/collections";
import type { Database } from "@/infrastructure/database/client";
import type { RegistrationDto } from "./registration_schemas";

export const registrationCollectionSchema = collectionQuerySchema.extend({
  status: z.enum(["all", "confirmed", "cancelled"]).default("all"),
});
export function registrationDto(
  row: typeof eventRegistration.$inferSelect,
): RegistrationDto {
  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: row.eventTitle,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}

/** A caller supplies either current staff event scope or the verified account's own ID. */
export class RegistrationCollection {
  constructor(private readonly db: Database) {}
  async query(
    organizationId: string,
    scope: { eventId: string } | { userId: string },
    raw: unknown,
  ) {
    const input = registrationCollectionSchema.parse(raw);
    return this.db.transaction(
      async (tx) => {
        const staff = "eventId" in scope;
        const where = and(
          eq(eventRegistration.organizationId, organizationId),
          staff
            ? eq(eventRegistration.eventId, scope.eventId)
            : eq(eventRegistration.userId, scope.userId),
          input.status !== "all"
            ? eq(eventRegistration.status, input.status)
            : undefined,
          input.search
            ? ilike(
                staff
                  ? sql`concat_ws(' ', ${user.name}, ${user.email})`
                  : eventRegistration.eventTitle,
                searchPattern(input.search),
              )
            : undefined,
        );
        const [matched] = await tx
          .select({ total: count() })
          .from(eventRegistration)
          .innerJoin(user, eq(user.id, eventRegistration.userId))
          .where(where);
        const page = collectionPage(matched.total, input.page, input.pageSize);
        const rows = await tx
          .select({
            registration: eventRegistration,
            name: sql<string>`coalesce(nullif(${user.name}, ''), ${user.email})`,
            email: user.email,
          })
          .from(eventRegistration)
          .innerJoin(user, eq(user.id, eventRegistration.userId))
          .where(where)
          .orderBy(desc(eventRegistration.createdAt), eventRegistration.id)
          .limit(input.pageSize)
          .offset(input.offset ?? (page - 1) * input.pageSize);
        return {
          items: rows.map((row) => ({
            ...registrationDto(row.registration),
            ...(staff
              ? {
                  name: row.name,
                  email: row.email,
                  formId: row.registration.formId,
                  submissionId: row.registration.submissionId,
                }
              : {}),
          })),
          total: matched.total,
          page,
          pageSize: input.pageSize,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
