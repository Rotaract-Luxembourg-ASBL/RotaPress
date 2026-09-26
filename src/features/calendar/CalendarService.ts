import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  calendar,
  calendarPage,
  calendarSchedule,
} from "../../../db/schema/calendar";
import { AuditRepository } from "@/core/audit/AuditRepository";
import {
  AuthorizationService,
  DomainError,
  type TrustedActor,
} from "@/core/authorization/AuthorizationService";
import type { Database } from "@/infrastructure/database/client";
import { CalendarReader } from "./CalendarReader";
import {
  calendarCommandSchema,
  calendarDefinitionSchema,
  calendarPageSchema,
  defaultCalendarPage,
  scheduleCommandSchema,
  scheduleSchema,
  type CalendarWorkspace,
} from "./calendar_schemas";
import { validateSchedule } from "./calendar_dates";

function version(actual: number, expected: number) {
  if (actual !== expected)
    throw new DomainError(
      "CALENDAR_CHANGED",
      "This changed in another tab. Reload before saving; your entered values are still here.",
      409,
    );
}

/** Automation may manage private drafts without changing any published snapshot. */
function protectPublication(
  operation: string,
  published: unknown,
  draftOnly: boolean | undefined,
) {
  if (
    draftOnly &&
    (!["save", "archive", "restore"].includes(operation) ||
      (operation !== "save" && Boolean(published)))
  )
    throw new DomainError(
      "CALENDAR_PUBLICATION_MANUAL",
      "This action only manages drafts. Use a separately granted publication action to publish; archive or restore published items in the Calendar workspace.",
      409,
    );
}
export class CalendarService {
  private readonly audit = new AuditRepository();
  constructor(
    private readonly db: Database,
    private readonly auth: AuthorizationService,
    readonly reader: CalendarReader,
  ) {}

  async workspace(actor: TrustedActor): Promise<CalendarWorkspace> {
    const { organizationId: org } = await this.auth.require(
      actor,
      "calendar.manage",
    );
    const [calendars, schedules, pages, events] = await Promise.all([
      this.db
        .select()
        .from(calendar)
        .where(eq(calendar.organizationId, org))
        .orderBy(calendar.updatedAt),
      this.db
        .select()
        .from(calendarSchedule)
        .where(eq(calendarSchedule.organizationId, org))
        .orderBy(calendarSchedule.updatedAt),
      this.db
        .select()
        .from(calendarPage)
        .where(eq(calendarPage.organizationId, org)),
      this.reader.events(),
    ]);
    return {
      calendars: calendars.map((c) => ({
        id: c.id,
        draft: calendarDefinitionSchema.parse(c.draft),
        published: c.published
          ? calendarDefinitionSchema.parse(c.published)
          : null,
        version: c.version,
        archived: c.archived,
      })),
      schedules: schedules.map((s) => ({
        id: s.id,
        calendarId: s.calendarId,
        draft: scheduleSchema.parse(s.draft),
        published: s.published ? scheduleSchema.parse(s.published) : null,
        version: s.version,
        archived: s.archived,
      })),
      events: events.map(({ id, title }) => ({ id, title })),
      page: pages[0]
        ? {
            draft: calendarPageSchema.parse(pages[0].draft),
            published: pages[0].published
              ? calendarPageSchema.parse(pages[0].published)
              : null,
            version: pages[0].version,
          }
        : { draft: defaultCalendarPage, published: null, version: 0 },
    };
  }
  async calendar(
    actor: TrustedActor,
    raw: unknown,
    options: { draftOnly?: boolean } = {},
  ) {
    const input = calendarCommandSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const { organizationId: org } = await this.auth.lock(
        actor,
        "calendar.manage",
        tx,
      );
      const rows = await tx
        .select()
        .from(calendar)
        .where(eq(calendar.organizationId, org));
      const current = input.id ? rows.find((c) => c.id === input.id) : null;
      if (input.id && !current)
        throw new DomainError(
          "CALENDAR_NOT_FOUND",
          "This calendar is unavailable.",
          404,
        );
      version(current?.version ?? 0, input.expectedVersion);
      protectPublication(
        input.operation,
        current?.published,
        options.draftOnly,
      );
      if (!current && (input.operation !== "save" || rows.length >= 30))
        throw new DomainError(
          "CALENDAR_LIMIT",
          "Create up to 30 calendars. Restore an existing calendar to reuse it.",
          422,
        );
      if (!current && !input.definition)
        throw new DomainError(
          "CALENDAR_DETAILS",
          "Enter the calendar details.",
          422,
        );
      if (
        current?.archived &&
        !["restore", "archive"].includes(input.operation)
      )
        throw new DomainError(
          "CALENDAR_ARCHIVED",
          "Restore the calendar before editing.",
          409,
        );
      const draft =
        input.operation === "save"
          ? calendarDefinitionSchema.parse(input.definition)
          : current!.draft;
      if (input.operation === "publish" && draft.eventSource === "selected") {
        const available = await this.reader.events();
        if (draft.eventIds.some((id) => !available.some((e) => e.id === id)))
          throw new DomainError(
            "CALENDAR_EVENT",
            "Choose currently published public events.",
            422,
          );
      }
      const values = {
        draft,
        published:
          input.operation === "publish"
            ? draft
            : ["unpublish", "archive"].includes(input.operation)
              ? null
              : (current?.published ?? null),
        archived:
          input.operation === "archive" ||
          (input.operation !== "restore" && Boolean(current?.archived)),
        version: (current?.version ?? 0) + 1,
        updatedAt: new Date(),
      };
      const [saved] = current
        ? await tx
            .update(calendar)
            .set(values)
            .where(
              and(
                eq(calendar.id, current.id),
                eq(calendar.organizationId, org),
              ),
            )
            .returning({ id: calendar.id, version: calendar.version })
        : await tx
            .insert(calendar)
            .values({ organizationId: org, ...values })
            .returning({ id: calendar.id, version: calendar.version });
      await this.audit.record(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: "calendar." + input.operation,
        targetId: saved.id,
      });
      return saved;
    });
  }
  async schedule(
    actor: TrustedActor,
    raw: unknown,
    options: { draftOnly?: boolean } = {},
  ) {
    const input = scheduleCommandSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const { organizationId: org } = await this.auth.lock(
        actor,
        "calendar.manage",
        tx,
      );
      const [parent] = await tx
        .select()
        .from(calendar)
        .where(
          and(
            eq(calendar.id, input.calendarId),
            eq(calendar.organizationId, org),
            eq(calendar.archived, false),
          ),
        );
      if (!parent)
        throw new DomainError(
          "CALENDAR_NOT_FOUND",
          "Choose an active calendar.",
          404,
        );
      const rows = await tx
        .select()
        .from(calendarSchedule)
        .where(
          and(
            eq(calendarSchedule.organizationId, org),
            eq(calendarSchedule.calendarId, parent.id),
          ),
        );
      const current = input.id ? rows.find((s) => s.id === input.id) : null;
      if (input.id && !current)
        throw new DomainError(
          "SCHEDULE_NOT_FOUND",
          "This schedule is unavailable in this calendar.",
          404,
        );
      version(current?.version ?? 0, input.expectedVersion);
      protectPublication(
        input.operation,
        current?.published,
        options.draftOnly,
      );
      if (!current && (input.operation !== "save" || rows.length >= 200))
        throw new DomainError(
          "SCHEDULE_LIMIT",
          "Each calendar supports up to 200 schedules.",
          422,
        );
      if (
        current?.archived &&
        !["restore", "archive"].includes(input.operation)
      )
        throw new DomainError(
          "SCHEDULE_ARCHIVED",
          "Restore this schedule before editing.",
          409,
        );
      const draft =
        input.operation === "save"
          ? scheduleSchema.parse(input.definition)
          : current!.draft;
      try {
        validateSchedule(draft);
      } catch {
        throw new DomainError(
          "SCHEDULE_DATES",
          "Check the dates, time zone and repeat end date.",
          422,
        );
      }
      const values = {
        draft,
        published:
          input.operation === "publish"
            ? draft
            : ["archive", "unpublish"].includes(input.operation)
              ? null
              : (current?.published ?? null),
        archived:
          input.operation === "archive" ||
          (input.operation !== "restore" && Boolean(current?.archived)),
        version: (current?.version ?? 0) + 1,
        updatedAt: new Date(),
      };
      const [saved] = current
        ? await tx
            .update(calendarSchedule)
            .set(values)
            .where(
              and(
                eq(calendarSchedule.id, current.id),
                eq(calendarSchedule.organizationId, org),
              ),
            )
            .returning({
              id: calendarSchedule.id,
              version: calendarSchedule.version,
            })
        : await tx
            .insert(calendarSchedule)
            .values({ organizationId: org, calendarId: parent.id, ...values })
            .returning({
              id: calendarSchedule.id,
              version: calendarSchedule.version,
            });
      await this.audit.record(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: "calendar.schedule." + input.operation,
        targetId: saved.id,
      });
      return saved;
    });
  }
  async page(actor: TrustedActor, raw: unknown) {
    const input = z
      .strictObject({
        operation: z.enum(["save", "publish"]),
        expectedVersion: z.number().int().min(0),
        definition: calendarPageSchema.optional(),
      })
      .parse(raw);
    return this.db.transaction(async (tx) => {
      const { organizationId: org } = await this.auth.lock(
        actor,
        "calendar.manage",
        tx,
      );
      const [current] = await tx
        .select()
        .from(calendarPage)
        .where(eq(calendarPage.organizationId, org));
      version(current?.version ?? 0, input.expectedVersion);
      const draft =
        input.operation === "save"
          ? calendarPageSchema.parse(input.definition)
          : (current?.draft ?? defaultCalendarPage);
      const calendars = await tx
        .select({ id: calendar.id })
        .from(calendar)
        .where(eq(calendar.organizationId, org));
      if (draft.calendarIds.some((id) => !calendars.some((c) => c.id === id)))
        throw new DomainError(
          "CALENDAR_SELECTION",
          "Choose calendars from this club.",
          422,
        );
      const values = {
        draft,
        published:
          input.operation === "publish" ? draft : (current?.published ?? null),
        version: (current?.version ?? 0) + 1,
      };
      await tx
        .insert(calendarPage)
        .values({ organizationId: org, ...values })
        .onConflictDoUpdate({
          target: calendarPage.organizationId,
          set: values,
        });
      await this.audit.record(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: "calendar.page." + input.operation,
      });
      return { saved: true, version: values.version };
    });
  }
}
