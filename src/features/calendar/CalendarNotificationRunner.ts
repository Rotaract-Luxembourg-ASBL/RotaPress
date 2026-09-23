import "server-only";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  calendarNotification,
  calendarSubscription,
} from "../../../db/schema/calendar";
import { user } from "../../../db/schema/auth";
import { FeatureAvailability } from "@/core/features/FeatureAvailability";
import {
  DomainError,
  type DatabaseExecutor,
} from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import type { ApplicationMailer } from "@/infrastructure/email/ApplicationMailer";
import { CalendarReader } from "./CalendarReader";

type Subscription = typeof calendarSubscription.$inferSelect;
/** Reuses the local job loop. Outbox writes and observed hashes commit together. */
export class CalendarNotificationRunner {
  private readonly features: FeatureAvailability;
  constructor(
    private readonly db: Database,
    private readonly reader: CalendarReader,
    private readonly mailer: Pick<
      ApplicationMailer,
      "sendCalendarNotification"
    >,
    private readonly origin: string,
  ) {
    this.features = new FeatureAvailability(db);
  }

  private async current(s: Subscription, tx: DatabaseExecutor) {
    if (!s.active) return null;
    try {
      await this.features.requireQueuedWork(
        s.organizationId,
        "calendar",
        s.subscribedAt,
        tx,
      );
    } catch (e) {
      if (e instanceof DomainError) return null;
      throw e;
    }
    const [identity] = await tx
      .select({ email: user.email, verified: user.emailVerified })
      .from(user)
      .where(eq(user.id, s.userId));
    if (!identity?.verified) return null;
    const sources = await this.reader.sources(s.userId, [s.calendarId], tx);
    return sources.calendars.length ? { sources, email: identity.email } : null;
  }
  private reminders(
    s: Subscription,
    sources: Awaited<ReturnType<CalendarReader["sources"]>>,
    now: Date,
  ) {
    if (!s.reminderMinutes) return [];
    const from = Temporal.Instant.from(now.toISOString())
      .toZonedDateTimeISO("UTC")
      .toPlainDate();
    const feed = this.reader.project(sources, {
      from: from.toString(),
      to: from.add({ days: 3 }).toString(),
      calendarIds: [s.calendarId],
      timezone: "UTC",
    });
    return feed.occurrences
      .filter(
        (o) =>
          !o.cancelled &&
          new Date(o.startsAt).getTime() > now.getTime() &&
          new Date(o.startsAt).getTime() - s.reminderMinutes * 60000 <=
            now.getTime(),
      )
      .map((o) => "reminder:" + o.id + ":" + o.startsAt);
  }
  async runBatch(limit = 5, now = new Date()) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new Error("INVALID_JOB_BATCH_SIZE");
    const result = {
      checked: 0,
      queued: 0,
      sent: 0,
      cancelled: 0,
      deferred: 0,
    };
    const candidates = await this.db
      .select({ id: calendarSubscription.id })
      .from(calendarSubscription)
      .where(eq(calendarSubscription.active, true))
      .orderBy(asc(calendarSubscription.checkedAt))
      .limit(limit);
    for (const candidate of candidates)
      await this.db.transaction(async (tx) => {
        const [s] = await tx
          .select()
          .from(calendarSubscription)
          .where(eq(calendarSubscription.id, candidate.id))
          .for("update", { skipLocked: true });
        if (!s) return;
        const current = await this.current(s, tx);
        result.checked++;
        if (current) {
          const fingerprint = this.reader.fingerprint(current.sources);
          const notices: { key: string; kind: "update" | "reminder" }[] =
            this.reminders(s, current.sources, now).map((key) => ({
              key,
              kind: "reminder",
            }));
          if (s.updates && s.fingerprint !== fingerprint)
            notices.push({ key: "update:" + randomUUID(), kind: "update" });
          if (notices.length) {
            const rows = await tx
              .insert(calendarNotification)
              .values(
                notices.map((n) => ({
                  ...n,
                  organizationId: s.organizationId,
                  subscriptionId: s.id,
                })),
              )
              .onConflictDoNothing()
              .returning({ id: calendarNotification.id });
            result.queued += rows.length;
          }
          await tx
            .update(calendarSubscription)
            .set({ fingerprint, checkedAt: now })
            .where(eq(calendarSubscription.id, s.id));
        } else
          await tx
            .update(calendarSubscription)
            .set({ checkedAt: now })
            .where(eq(calendarSubscription.id, s.id));
      });
    await this.db.execute(
      sql`UPDATE club.calendar_notification SET status = 'failed', lease_token = NULL, lease_expires_at = NULL WHERE attempts >= 5 AND (status = 'pending' OR (status = 'processing' AND lease_expires_at <= now()))`,
    );
    for (let index = 0; index < limit; index++) {
      const token = randomUUID();
      const claimed = await this.db.execute<{
        id: string;
      }>(sql`WITH candidate AS (
        SELECT id FROM club.calendar_notification WHERE attempts < 5 AND ((status = 'pending' AND available_at <= now()) OR (status = 'processing' AND lease_expires_at <= now()))
        ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE club.calendar_notification n SET status = 'processing', attempts = n.attempts + 1, lease_token = ${token}, lease_expires_at = now() + interval '2 minutes'
      FROM candidate WHERE n.id = candidate.id RETURNING n.id`);
      if (!claimed.rows[0]) break;
      const [notice] = await this.db
        .select()
        .from(calendarNotification)
        .where(eq(calendarNotification.id, claimed.rows[0].id));
      const [s] = await this.db
        .select()
        .from(calendarSubscription)
        .where(
          and(
            eq(calendarSubscription.id, notice.subscriptionId),
            eq(calendarSubscription.organizationId, notice.organizationId),
          ),
        );
      const current = s ? await this.current(s, this.db) : null;
      const allowed =
        current &&
        notice.createdAt >= s.subscribedAt &&
        (notice.kind === "update"
          ? s.updates
          : this.reminders(s, current.sources, now).includes(notice.key));
      const own = and(
        eq(calendarNotification.id, notice.id),
        eq(calendarNotification.leaseToken, token),
        eq(calendarNotification.status, "processing"),
      );
      if (!allowed) {
        await this.db
          .update(calendarNotification)
          .set({ status: "cancelled", leaseToken: null, leaseExpiresAt: null })
          .where(own);
        result.cancelled++;
        continue;
      }
      try {
        if (s.email)
          await this.mailer.sendCalendarNotification(
            current.email,
            notice.kind,
            new URL("/calendar?tab=subscriptions", this.origin).href,
            "<calendar-" + notice.id + "@rotapress.local>",
            {
              id: s.id,
              emailVersion: s.emailVersion,
              calendarId: s.calendarId,
            },
          );
        await this.db
          .update(calendarNotification)
          .set({ status: "sent", leaseToken: null, leaseExpiresAt: null })
          .where(own);
        result.sent++;
      } catch {
        await this.db
          .update(calendarNotification)
          .set({
            status: notice.attempts >= 5 ? "failed" : "pending",
            availableAt: new Date(
              now.getTime() + Math.min(3600, 30 * 2 ** notice.attempts) * 1000,
            ),
            leaseToken: null,
            leaseExpiresAt: null,
          })
          .where(own);
        result.deferred++;
      }
    }
    return result;
  }
}
