import "server-only";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import {
  lumaApiEvent,
  lumaGuestProjection,
  lumaSyncRun,
} from "../../../db/schema/luma-sync";
import type {
  DatabaseExecutor,
  Transaction,
} from "../../core/authorization/AuthorizationService";
import { connectionMessages } from "./connection_schemas";
import { LumaSourceAccess } from "./LumaSourceAccess";
import {
  syncMessages,
  type ImportedGuest,
  type SyncRunDto,
} from "./sync_schemas";

export class LumaSyncRepository {
  async link(
    org: string,
    eventId: string,
    db: DatabaseExecutor,
    sourceId?: string,
  ) {
    const source = await new LumaSourceAccess().selection(
      org,
      eventId,
      db,
      sourceId,
    );
    if (!source) return undefined;
    const [row] = await db
      .select()
      .from(lumaApiEvent)
      .where(
        and(
          eq(lumaApiEvent.organizationId, org),
          eq(lumaApiEvent.eventId, eventId),
          eq(lumaApiEvent.sourceId, source.id),
        ),
      );
    return row;
  }
  async history(
    org: string,
    eventId: string,
    db: DatabaseExecutor,
    sourceId?: string,
  ) {
    const source = await new LumaSourceAccess().selection(
      org,
      eventId,
      db,
      sourceId,
    );
    if (!source) return [];
    const rows = await db
      .select()
      .from(lumaSyncRun)
      .where(
        and(
          eq(lumaSyncRun.organizationId, org),
          eq(lumaSyncRun.eventId, eventId),
          eq(lumaSyncRun.sourceId, source.id),
        ),
      )
      .orderBy(desc(lumaSyncRun.startedAt))
      .limit(10);
    return rows.map((row): SyncRunDto => {
      const interrupted =
        row.status === "running" &&
        Date.now() - row.startedAt.getTime() > 35_000;
      const code = interrupted ? "SYNC_INTERRUPTED" : row.errorCode;
      const messages: Record<string, string> = {
        ...connectionMessages,
        ...syncMessages,
      };
      return {
        id: row.id,
        status: interrupted ? "interrupted" : row.status,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        guestCount: row.guestCount,
        message: code ? (messages[code] ?? syncMessages.SYNC_FAILED) : null,
      };
    });
  }
  async guests(
    org: string,
    eventId: string,
    db: DatabaseExecutor,
    sourceId?: string,
  ) {
    const source = await new LumaSourceAccess().selection(
      org,
      eventId,
      db,
      sourceId,
    );
    if (!source) return { count: 0, guests: [] };
    const filter = and(
      eq(lumaGuestProjection.organizationId, org),
      eq(lumaGuestProjection.eventId, eventId),
      eq(lumaGuestProjection.sourceId, source.id),
    );
    const [total] = await db
      .select({ value: count() })
      .from(lumaGuestProjection)
      .where(filter);
    const rows = await db
      .select({
        id: lumaGuestProjection.id,
        providerGuestId: lumaGuestProjection.providerGuestId,
        name: lumaGuestProjection.name,
        email: lumaGuestProjection.email,
        approvalStatus: lumaGuestProjection.approvalStatus,
        ticketCount: lumaGuestProjection.ticketCount,
        present: lumaGuestProjection.present,
        observedAt: lumaGuestProjection.observedAt,
      })
      .from(lumaGuestProjection)
      .where(filter)
      .orderBy(
        desc(lumaGuestProjection.present),
        desc(lumaGuestProjection.observedAt),
        lumaGuestProjection.id,
      )
      .limit(100);
    return {
      count: total.value,
      guests: rows.map((row) => ({
        ...row,
        observedAt: row.observedAt.toISOString(),
      })),
    };
  }
  async reconcile(
    org: string,
    eventId: string,
    runId: string,
    guests: ImportedGuest[],
    tx: Transaction,
    sourceId: string,
  ) {
    const now = new Date();
    // Every validated page is ready before this transaction changes any private projection.
    for (const guest of guests) {
      const values = {
        ...guest,
        present: true,
        observedAt: now,
        lastSeenRunId: runId,
      };
      await tx
        .insert(lumaGuestProjection)
        .values({ organizationId: org, eventId, sourceId, ...values })
        .onConflictDoUpdate({
          target: [
            lumaGuestProjection.sourceId,
            lumaGuestProjection.providerGuestId,
          ],
          set: values,
        });
    }
    await tx
      .update(lumaGuestProjection)
      .set({ present: false })
      .where(
        and(
          eq(lumaGuestProjection.organizationId, org),
          eq(lumaGuestProjection.eventId, eventId),
          eq(lumaGuestProjection.sourceId, sourceId),
          ne(lumaGuestProjection.lastSeenRunId, runId),
        ),
      );
    await tx
      .update(lumaApiEvent)
      .set({ lastSuccessAt: now })
      .where(
        and(
          eq(lumaApiEvent.eventId, eventId),
          eq(lumaApiEvent.sourceId, sourceId),
        ),
      );
  }
  async prune(org: string, eventId: string, tx: Transaction, sourceId: string) {
    const old = await tx
      .select({ id: lumaSyncRun.id })
      .from(lumaSyncRun)
      .where(
        and(
          eq(lumaSyncRun.organizationId, org),
          eq(lumaSyncRun.eventId, eventId),
          eq(lumaSyncRun.sourceId, sourceId),
        ),
      )
      .orderBy(desc(lumaSyncRun.startedAt))
      .offset(10);
    if (old.length)
      await tx.delete(lumaSyncRun).where(
        inArray(
          lumaSyncRun.id,
          old.map((r) => r.id),
        ),
      );
  }
}
