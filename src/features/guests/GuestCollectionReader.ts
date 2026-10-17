import "server-only";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { user } from "../../../db/schema/auth";
import { guestAccess } from "../../../db/schema/guest-access";
import { eventRegistration } from "../../../db/schema/registrations";
import { lumaGuestProjection } from "../../../db/schema/luma-sync";
import { eventPackageSource } from "../../../db/schema/event-packages";
import type { DatabaseExecutor } from "@/core/authorization/AuthorizationService";
import { collectionPage, searchPattern } from "@/core/collections";
import type { GuestCollectionQuery } from "./guest_collection";

/** Staff scope is established by GuestAccessService before this repository is called. */
export class GuestCollectionReader {
  async candidates(
    tx: DatabaseExecutor,
    organizationId: string,
    eventId: string,
    input: GuestCollectionQuery,
  ) {
    const invited = (source: "native" | "luma") =>
      tx
        .select({ id: guestAccess.id })
        .from(guestAccess)
        .where(
          and(
            eq(guestAccess.organizationId, organizationId),
            eq(guestAccess.eventId, eventId),
            isNull(guestAccess.revokedAt),
            source === "native"
              ? eq(guestAccess.registrationId, eventRegistration.id)
              : eq(guestAccess.lumaGuestId, lumaGuestProjection.id),
          ),
        );
    const native = tx
      .select({
        id: eventRegistration.id,
        source: sql<"native" | "luma">`'native'`.as("source"),
        sourceId: sql<string | null>`null::uuid`.as("source_id"),
        sourceLabel: sql<string | null>`null::text`.as("source_label"),
        name: sql<string>`coalesce(nullif(${user.name}, ''), ${user.email})`.as(
          "name",
        ),
        email: user.email,
        status: sql<string>`${eventRegistration.status}`.as("status"),
        createdAt: eventRegistration.createdAt,
      })
      .from(eventRegistration)
      .innerJoin(user, eq(user.id, eventRegistration.userId))
      .where(
        and(
          eq(eventRegistration.organizationId, organizationId),
          eq(eventRegistration.eventId, eventId),
          eq(eventRegistration.status, "confirmed"),
          notExists(invited("native")),
        ),
      );
    const external = tx
      .select({
        id: lumaGuestProjection.id,
        source: sql<"native" | "luma">`'luma'`.as("source"),
        sourceId: lumaGuestProjection.sourceId,
        sourceLabel: eventPackageSource.label,
        name: sql<string>`coalesce(${lumaGuestProjection.name}, 'Guest')`.as(
          "name",
        ),
        email: lumaGuestProjection.email,
        status: sql<string>`${lumaGuestProjection.approvalStatus}`.as("status"),
        createdAt: lumaGuestProjection.observedAt,
      })
      .from(lumaGuestProjection)
      .innerJoin(
        eventPackageSource,
        and(
          eq(eventPackageSource.id, lumaGuestProjection.sourceId),
          eq(eventPackageSource.eventId, eventId),
          eq(eventPackageSource.organizationId, organizationId),
        ),
      )
      .where(
        and(
          eq(lumaGuestProjection.organizationId, organizationId),
          eq(lumaGuestProjection.eventId, eventId),
          eq(lumaGuestProjection.present, true),
          sql`${lumaGuestProjection.approvalStatus} <> 'declined'`,
          notExists(invited("luma")),
        ),
      );
    const sources = unionAll(native, external).as("guest_candidates");
    const where = and(
      input.source === "all" ? undefined : eq(sources.source, input.source),
      input.search
        ? or(
            ilike(sources.name, searchPattern(input.search)),
            ilike(sources.email, searchPattern(input.search)),
          )
        : undefined,
    );
    const [matched] = await tx
      .select({ total: count() })
      .from(sources)
      .where(where);
    const page = collectionPage(
      matched.total,
      input.candidatePage,
      input.pageSize,
    );
    const rows = await tx
      .select()
      .from(sources)
      .where(where)
      .orderBy(desc(sources.createdAt), sources.source, sources.id)
      .limit(input.pageSize)
      .offset((page - 1) * input.pageSize);
    return {
      items: rows.map(
        ({ id, source, sourceId, sourceLabel, name, email, status }) => ({
          id,
          source,
          sourceId: sourceId ?? undefined,
          sourceLabel: sourceLabel ?? undefined,
          name,
          email,
          status,
        }),
      ),
      total: matched.total,
      page,
      pageSize: input.pageSize,
    };
  }

  async grants(
    tx: DatabaseExecutor,
    organizationId: string,
    eventId: string,
    input: GuestCollectionQuery,
  ) {
    const where = and(
      eq(guestAccess.organizationId, organizationId),
      eq(guestAccess.eventId, eventId),
      input.search
        ? ilike(guestAccess.recipientEmail, searchPattern(input.search))
        : undefined,
      input.source === "native"
        ? sql`${guestAccess.registrationId} is not null`
        : input.source === "luma"
          ? sql`${guestAccess.lumaGuestId} is not null`
          : undefined,
    );
    const [matched] = await tx
      .select({ total: count() })
      .from(guestAccess)
      .where(where);
    const page = collectionPage(matched.total, input.page, input.pageSize);
    const items = await tx
      .select()
      .from(guestAccess)
      .where(where)
      .orderBy(desc(guestAccess.createdAt), guestAccess.id)
      .limit(input.pageSize)
      .offset((page - 1) * input.pageSize);
    return { items, total: matched.total, page, pageSize: input.pageSize };
  }
}
