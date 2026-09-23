import "server-only";
import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  calendar,
  calendarPage,
  calendarSchedule,
} from "../../../db/schema/calendar";
import { calendarSource } from "../../../db/schema/calendar-sources";
import { calendarImportAdapter } from "./providers/adapters";
import { installation, membership } from "../../../db/schema/club";
import { user } from "../../../db/schema/auth";
import { FeatureAvailability } from "@/core/features/FeatureAvailability";
import type { Database } from "@/infrastructure/database/client";
import {
  DomainError,
  requireVerifiedActor,
  type DatabaseExecutor,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import type { PublicEventCard } from "@/features/events/event_catalogue";
import {
  calendarDefinitionSchema,
  calendarPageSchema,
  defaultCalendarPage,
  rangeSchema,
  scheduleSchema,
  type CalendarFeed,
  type CalendarRange,
  type Occurrence,
} from "./calendar_schemas";
import { scheduleOccurrences, validateRange } from "./calendar_dates";

export type CalendarEventSource = () => Promise<PublicEventCard[]>;
export class CalendarReader {
  private readonly features: FeatureAvailability;
  constructor(
    private readonly db: Database,
    readonly events: CalendarEventSource,
  ) {
    this.features = new FeatureAvailability(db);
  }

  async organization(tx: DatabaseExecutor = this.db) {
    const [site] = await tx
      .select({ id: installation.organizationId })
      .from(installation)
      .where(eq(installation.id, 1));
    if (!site?.id)
      throw new DomainError(
        "CALENDAR_UNAVAILABLE",
        "Calendar is unavailable.",
        404,
      );
    return site.id;
  }
  async visible(userId: string | null, tx: DatabaseExecutor = this.db) {
    const org = await this.organization(tx);
    if (!(await this.features.enabled(org, "calendar", tx))) return [];
    const [identity] = userId
      ? await tx
          .select({ verified: user.emailVerified })
          .from(user)
          .where(eq(user.id, userId))
      : [];
    const [member] = identity?.verified
      ? await tx
          .select({ status: membership.status })
          .from(membership)
          .where(
            and(
              eq(membership.organizationId, org),
              eq(membership.userId, userId!),
            ),
          )
      : [];
    const rows = await tx
      .select({ id: calendar.id, definition: calendar.published })
      .from(calendar)
      .where(
        and(
          eq(calendar.organizationId, org),
          eq(calendar.archived, false),
          isNotNull(calendar.published),
        ),
      )
      .orderBy(calendar.id);
    return rows.flatMap((row) => {
      const definition = calendarDefinitionSchema.parse(row.definition);
      return definition.audience === "public" || member?.status === "approved"
        ? [{ id: row.id, ...definition }]
        : [];
    });
  }
  async sources(
    userId: string | null,
    ids: string[],
    tx: DatabaseExecutor = this.db,
  ) {
    const org = await this.organization(tx);
    const calendars = (await this.visible(userId, tx)).filter(
      (c) => !ids.length || ids.includes(c.id),
    );
    const schedules = calendars.length
      ? await tx
          .select({
            id: calendarSchedule.id,
            calendarId: calendarSchedule.calendarId,
            definition: calendarSchedule.published,
          })
          .from(calendarSchedule)
          .where(
            and(
              eq(calendarSchedule.organizationId, org),
              eq(calendarSchedule.archived, false),
              inArray(
                calendarSchedule.calendarId,
                calendars.map((c) => c.id),
              ),
              isNotNull(calendarSchedule.published),
            ),
          )
          .orderBy(calendarSchedule.id)
      : [];
    // Only the existing public event projection is reused. Membership never widens private event access.
    const events = calendars.some((c) => c.eventSource !== "none")
      ? await this.events()
      : [];
    const includedEvents = events.filter((event) =>
      calendars.some(
        (c) =>
          c.eventSource === "all" ||
          (c.eventSource === "selected" && c.eventIds.includes(event.id)),
      ),
    );
    const imports = calendars.length
      ? await tx
          .select({
            id: calendarSource.id,
            calendarId: calendarSource.calendarId,
            provider: calendarSource.provider,
            document: calendarSource.published,
            timezone: calendarSource.timezone,
          })
          .from(calendarSource)
          .where(
            and(
              eq(calendarSource.organizationId, org),
              eq(calendarSource.enabled, true),
              inArray(
                calendarSource.calendarId,
                calendars.map((c) => c.id),
              ),
              isNotNull(calendarSource.published),
            ),
          )
          .orderBy(calendarSource.id)
      : [];
    return { calendars, schedules, events: includedEvents, imports };
  }
  fingerprint(sources: Awaited<ReturnType<CalendarReader["sources"]>>) {
    return createHash("sha256").update(JSON.stringify(sources)).digest("hex");
  }
  async feed(
    actor: TrustedActor | null,
    input: unknown,
  ): Promise<CalendarFeed> {
    if (actor) requireVerifiedActor(actor);
    const range = rangeSchema.parse(input);
    try {
      validateRange(range);
    } catch {
      throw new DomainError(
        "CALENDAR_RANGE",
        "Choose a valid range of at most 93 days.",
        422,
      );
    }
    return this.db.transaction(
      async (tx) =>
        this.project(
          await this.sources(actor?.userId ?? null, range.calendarIds, tx),
          range,
        ),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
  project(
    sources: Awaited<ReturnType<CalendarReader["sources"]>>,
    range: CalendarRange,
  ): CalendarFeed {
    const items: Occurrence[] = [];
    // Bound work as well as the response; a dense merged feed must not expand every series.
    const append = (next: Occurrence[]) =>
      items.push(...next.slice(0, Math.max(0, 2001 - items.length)));
    for (const row of sources.schedules) {
      if (items.length > 2000) break;
      append(
        scheduleOccurrences(
          row.id,
          row.calendarId,
          scheduleSchema.parse(row.definition),
          range,
        ),
      );
    }
    for (const source of sources.imports) {
      if (items.length > 2000) break;
      if (source.document)
        append(
          calendarImportAdapter(source.provider).occurrences(
            source.document,
            source.timezone,
            source.id,
            source.calendarId,
            range,
          ),
        );
    }
    const from = Temporal.PlainDate.from(range.from).toZonedDateTime(
      range.timezone,
    ).epochMilliseconds;
    const to = Temporal.PlainDate.from(range.to).toZonedDateTime(
      range.timezone,
    ).epochMilliseconds;
    for (const event of sources.events) {
      if (items.length > 2000) break;
      const end =
        event.endsAt ??
        new Date(new Date(event.startsAt).getTime() + 3600000).toISOString();
      if (
        new Date(end).getTime() <= from ||
        new Date(event.startsAt).getTime() >= to
      )
        continue;
      items.push({
        id: "event:" + event.id,
        source: "event",
        sourceId: event.id,
        calendarIds: sources.calendars
          .filter(
            (c) =>
              c.eventSource === "all" ||
              (c.eventSource === "selected" && c.eventIds.includes(event.id)),
          )
          .map((c) => c.id),
        title: event.title,
        description: event.description,
        location: event.venue,
        url: event.href,
        startsAt: event.startsAt,
        endsAt: end,
        date: event.startsAt.slice(0, 10),
        endDate: end.slice(0, 10),
        allDay: false,
        timezone: event.timezone,
        cancelled: event.cancelled,
      });
    }
    items.sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
    );
    return {
      calendars: sources.calendars.map(
        ({ id, name, description, color, timezone, audience }) => ({
          id,
          name,
          description,
          color,
          timezone,
          audience,
        }),
      ),
      occurrences: items.slice(0, 2000),
      truncated: items.length > 2000,
    };
  }
  async page() {
    const org = await this.organization();
    const [row] = await this.db
      .select({ published: calendarPage.published })
      .from(calendarPage)
      .where(eq(calendarPage.organizationId, org));
    return row?.published
      ? calendarPageSchema.parse(row.published)
      : defaultCalendarPage;
  }
}
