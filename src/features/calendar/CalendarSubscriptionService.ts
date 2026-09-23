import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  calendarSubscription,
  calendarNotification,
} from "../../../db/schema/calendar";
import { organization } from "../../../db/schema/club";
import {
  DomainError,
  requireVerifiedActor,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import { FeatureAvailability } from "@/core/features/FeatureAvailability";
import {
  subscriptionSchema,
  type CalendarSubscriptions,
} from "./calendar_schemas";
import { CalendarReader } from "./CalendarReader";

export class CalendarSubscriptionService {
  constructor(
    private readonly db: Database,
    private readonly reader: CalendarReader,
  ) {}
  async save(actor: TrustedActor, raw: unknown) {
    requireVerifiedActor(actor);
    const values = subscriptionSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const org = await this.reader.organization(tx);
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, org))
        .for("update");
      const source = await this.reader.sources(
        actor.userId,
        [values.calendarId],
        tx,
      );
      if (values.active && !source.calendars.length)
        throw new DomainError(
          "CALENDAR_NOT_FOUND",
          "This calendar is unavailable to your account.",
          404,
        );
      const [existing] = await tx
        .select({
          id: calendarSubscription.id,
          active: calendarSubscription.active,
          email: calendarSubscription.email,
        })
        .from(calendarSubscription)
        .where(
          and(
            eq(calendarSubscription.organizationId, org),
            eq(calendarSubscription.calendarId, values.calendarId),
            eq(calendarSubscription.userId, actor.userId),
          ),
        );
      if (!existing && !values.active) return { saved: true };
      const [saved] = await tx
        .insert(calendarSubscription)
        .values({
          ...values,
          organizationId: org,
          userId: actor.userId,
          fingerprint: this.reader.fingerprint(source),
        })
        .onConflictDoUpdate({
          target: [
            calendarSubscription.calendarId,
            calendarSubscription.userId,
          ],
          set: {
            ...values,
            ...(values.active &&
            values.email &&
            (!existing?.active || !existing?.email)
              ? { emailVersion: randomUUID() }
              : {}),
            fingerprint: this.reader.fingerprint(source),
            subscribedAt: new Date(),
            checkedAt: new Date(),
          },
        })
        .returning({ id: calendarSubscription.id });
      await tx
        .update(calendarNotification)
        .set({ status: "cancelled", leaseToken: null, leaseExpiresAt: null })
        .where(
          and(
            eq(calendarNotification.subscriptionId, saved.id),
            inArray(calendarNotification.status, ["pending", "processing"]),
          ),
        );
      return { saved: true };
    });
  }
  async workspace(actor: TrustedActor): Promise<CalendarSubscriptions> {
    requireVerifiedActor(actor);
    const org = await this.reader.organization();
    const visible = await this.reader.visible(actor.userId);
    const state = (await new FeatureAvailability(this.db).states(org)).find(
      (s) => s.key === "calendar",
    )!;
    const subscriptions = await this.db
      .select()
      .from(calendarSubscription)
      .where(
        and(
          eq(calendarSubscription.userId, actor.userId),
          eq(calendarSubscription.organizationId, org),
        ),
      );
    const notices = subscriptions.length
      ? await this.db
          .select()
          .from(calendarNotification)
          .where(
            and(
              eq(calendarNotification.organizationId, org),
              inArray(
                calendarNotification.subscriptionId,
                subscriptions.map((s) => s.id),
              ),
              inArray(calendarNotification.status, [
                "pending",
                "processing",
                "sent",
                "failed",
              ]),
            ),
          )
          .orderBy(desc(calendarNotification.createdAt))
          .limit(50)
      : [];
    return {
      items: subscriptions.map((s) => ({
        calendarId: s.calendarId,
        active: s.active,
        email: s.email,
        updates: s.updates,
        reminderMinutes: s.reminderMinutes as 0 | 60 | 1440,
        paused:
          !state.enabled ||
          Boolean(
            state.lastDisabledAt && state.lastDisabledAt >= s.subscribedAt,
          ),
        name:
          visible.find((c) => c.id === s.calendarId)?.name ??
          "Unavailable calendar",
        available: visible.some((c) => c.id === s.calendarId),
      })),
      notifications: notices.flatMap((n) => {
        const subscription = subscriptions.find(
          (s) => s.id === n.subscriptionId && s.active,
        );
        const current = visible.find((c) => c.id === subscription?.calendarId);
        return current
          ? [
              {
                id: n.id,
                calendarId: current.id,
                name: current.name,
                kind: n.kind,
                createdAt: n.createdAt.toISOString(),
                read: Boolean(n.readAt),
              },
            ]
          : [];
      }),
    };
  }
  async read(actor: TrustedActor, raw: unknown) {
    requireVerifiedActor(actor);
    const { id } = z.strictObject({ id: z.uuid() }).parse(raw);
    const org = await this.reader.organization();
    const owned = await this.db
      .select({ id: calendarSubscription.id })
      .from(calendarSubscription)
      .where(
        and(
          eq(calendarSubscription.organizationId, org),
          eq(calendarSubscription.userId, actor.userId),
        ),
      );
    if (owned.length)
      await this.db
        .update(calendarNotification)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(calendarNotification.id, id),
            eq(calendarNotification.organizationId, org),
            inArray(
              calendarNotification.subscriptionId,
              owned.map((s) => s.id),
            ),
          ),
        );
    return { saved: true };
  }
}
