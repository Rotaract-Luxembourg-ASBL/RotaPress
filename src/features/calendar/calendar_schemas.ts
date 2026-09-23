import { z } from "zod";
import { isSafeLink } from "@/core/safe-link";

export const calendarColors = [
  "#25636b",
  "#a84332",
  "#6746a0",
  "#1766a3",
  "#ad2e71",
  "#68742a",
  "#94600e",
  "#46586e",
] as const;
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const zoneSchema = z
  .string()
  .max(80)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone, such as Europe/Luxembourg.");
export const calendarDefinitionSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000),
  color: z.enum(calendarColors),
  timezone: zoneSchema,
  audience: z.enum(["public", "members"]),
  eventSource: z.enum(["none", "all", "selected"]),
  eventIds: z.array(z.uuid()).max(100),
});
export const scheduleSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000),
  location: z.string().trim().max(200),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => !v || isSafeLink(v), "Use a safe website or relative link."),
  date: dateSchema,
  time,
  timezone: zoneSchema,
  durationMinutes: z.number().int().min(5).max(10080),
  allDay: z.boolean(),
  days: z.number().int().min(1).max(7),
  repeat: z.enum(["once", "daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(12),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  until: z.union([dateSchema, z.literal("")]),
  skippedDates: z.array(dateSchema).max(100),
  cancelled: z.boolean(),
});
export const calendarPageSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  introduction: z.string().trim().max(1200),
  calendarIds: z.array(z.uuid()).max(30),
  view: z.enum(["month", "week", "agenda"]),
  timezone: zoneSchema,
});
export const defaultCalendarPage = calendarPageSchema.parse({
  title: "Community calendar",
  introduction:
    "Make time for what matters. Explore activities, gatherings and club life.",
  calendarIds: [],
  view: "month",
  timezone: "Europe/Luxembourg",
});
export const rangeSchema = z.strictObject({
  from: dateSchema,
  to: dateSchema,
  calendarIds: z.array(z.uuid()).max(30).default([]),
  timezone: zoneSchema.default("Europe/Luxembourg"),
});
export const calendarCommandSchema = z.strictObject({
  operation: z.enum(["save", "publish", "unpublish", "archive", "restore"]),
  id: z.uuid().optional(),
  expectedVersion: z.number().int().min(0),
  definition: calendarDefinitionSchema.optional(),
});
export const scheduleCommandSchema = z.strictObject({
  operation: z.enum(["save", "publish", "unpublish", "archive", "restore"]),
  calendarId: z.uuid(),
  id: z.uuid().optional(),
  expectedVersion: z.number().int().min(0),
  definition: scheduleSchema.optional(),
});
export const subscriptionSchema = z.strictObject({
  calendarId: z.uuid(),
  active: z.boolean(),
  email: z.boolean(),
  updates: z.boolean(),
  reminderMinutes: z.union([z.literal(0), z.literal(60), z.literal(1440)]),
});
export type CalendarDefinition = z.infer<typeof calendarDefinitionSchema>;
export type ScheduleDefinition = z.infer<typeof scheduleSchema>;
export type CalendarPageDefinition = z.infer<typeof calendarPageSchema>;
export type CalendarRange = z.infer<typeof rangeSchema>;
export type CalendarSummary = Pick<
  CalendarDefinition,
  "name" | "description" | "color" | "timezone" | "audience"
> & { id: string };
export type CalendarRecord = {
  id: string;
  draft: CalendarDefinition;
  published: CalendarDefinition | null;
  version: number;
  archived: boolean;
};
export type ScheduleRecord = {
  id: string;
  calendarId: string;
  draft: ScheduleDefinition;
  published: ScheduleDefinition | null;
  version: number;
  archived: boolean;
};
export type Occurrence = {
  id: string;
  source: "schedule" | "event";
  sourceId: string;
  calendarIds: string[];
  title: string;
  description: string;
  location: string;
  url: string;
  startsAt: string;
  endsAt: string;
  date: string;
  endDate: string;
  allDay: boolean;
  timezone: string;
  cancelled: boolean;
};
export type CalendarFeed = {
  calendars: CalendarSummary[];
  occurrences: Occurrence[];
  truncated: boolean;
};
export type CalendarWorkspace = {
  calendars: CalendarRecord[];
  schedules: ScheduleRecord[];
  events: { id: string; title: string }[];
  page: {
    draft: CalendarPageDefinition;
    published: CalendarPageDefinition | null;
    version: number;
  };
};
export type CalendarSubscriptions = {
  items: (z.infer<typeof subscriptionSchema> & {
    name: string;
    available: boolean;
    paused: boolean;
  })[];
  notifications: {
    id: string;
    calendarId: string;
    name: string;
    kind: "update" | "reminder";
    createdAt: string;
    read: boolean;
  }[];
};
