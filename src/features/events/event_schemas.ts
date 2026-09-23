import { z } from "zod";

const instant = z.iso.datetime({ offset: true });
export const eventFieldsSchema = z.strictObject({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000),
  startsAt: instant,
  endsAt: instant.nullable(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid IANA time zone."),
  venue: z.string().trim().max(300),
  visibility: z.enum(["public", "unlisted", "private"]),
});
function ordered(value: EventFields) {
  return !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt);
}
export const createEventSchema = eventFieldsSchema
  .extend({ managerUserId: z.string().min(1).max(100) })
  .refine(ordered, "The end must be after the start.");
export const saveEventSchema = eventFieldsSchema
  .extend({ id: z.uuid(), expectedVersion: z.number().int().positive() })
  .refine(ordered, "The end must be after the start.");
export const eventVersionSchema = z.strictObject({
  id: z.uuid(),
  expectedVersion: z.number().int().positive(),
});
export const eventManagerChangeSchema = eventVersionSchema.extend({
  managerUserId: z.string().min(1).max(100),
  confirmed: z.literal(true),
});
export const eventEditorChangeSchema = eventVersionSchema.extend({
  role: z.enum(["editor", "registration-manager"]).default("editor"),
  userId: z.string().min(1).max(100),
  operation: z.enum(["grant", "revoke"]),
  confirmed: z.literal(true),
});
export type EventCapability =
  | "events.entries.manage"
  | "events.guests.manage"
  | "events.responses.manage"
  | "events.edit"
  | "events.archive"
  | "events.cancel"
  | "events.team.manage"
  | "events.publish"
  | "events.modules.manage";
export const eventRoleCapabilities: Record<
  "manager" | "editor" | "registration-manager",
  readonly EventCapability[]
> = {
  manager: [
    "events.entries.manage",
    "events.guests.manage",
    "events.responses.manage",
    "events.edit",
    "events.archive",
    "events.cancel",
    "events.team.manage",
    "events.publish",
    "events.modules.manage",
  ],
  editor: ["events.edit"],
  "registration-manager": ["events.responses.manage", "events.guests.manage"],
};
export type EventFields = z.infer<typeof eventFieldsSchema>;
export type EventSummary = EventFields & {
  canArchive?: boolean;
  id: string;
  slug: string;
  featured: boolean;
  version: number;
  archived: boolean;
  cancelled: boolean;
  published: boolean;
  updatedAt: string;
  manager: { userId: string; name: string } | null;
};
/** Select only editable fields from a scoped event projection. */
export function eventFields(event: EventFields): EventFields {
  return eventFieldsSchema.parse({
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    venue: event.venue,
    visibility: event.visibility,
  });
}
export type EventDraft = EventSummary & {
  capabilities: readonly EventCapability[];
};
export type EventTeam = {
  members: {
    userId: string;
    name: string;
    role: "manager" | "editor" | "registration-manager";
    status: string;
  }[];
  candidates: { userId: string; name: string }[];
};
export type ManagerOption = {
  userId: string;
  name: string;
  isCurrent: boolean;
};
