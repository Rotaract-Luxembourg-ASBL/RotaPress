import { z } from "zod";

export const featureKeySchema = z.enum(["forms", "events", "calendar"]);
export type FeatureKey = z.infer<typeof featureKeySchema>;
export type FeatureFlags = Record<FeatureKey, boolean>;
export type FeatureState = {
  key: FeatureKey;
  enabled: boolean;
  version: number;
};

export const featureCatalogue = {
  calendar: {
    name: "Calendar",
    description:
      "Manage calendars, recurring schedules, event feeds and opt-in reminders.",
    href: "/admin/calendar",
    disableImpact:
      "Calendar pages, blocks, feeds and new notifications will pause. Saved calendars, schedules and subscriptions remain stored.",
    enableImpact:
      "Published calendars become available again to their permitted audience. Review subscriptions to resume notifications and use Resume sync on feed connections.",
  },
  forms: {
    name: "Forms",
    description:
      "Build contact and membership forms, collect private responses and manage notifications.",
    href: "/admin/forms",
    disableImpact:
      "Contact and membership forms, new form-based membership applications, event forms and native event registration will pause. Forms and responses will disappear from administration navigation. Existing memberships and registration records remain unchanged.",
    enableImpact:
      "Published forms and form-based membership applications will resume. Event forms and native registration resume only where Events and their event features are already enabled.",
  },
  events: {
    name: "Events",
    description:
      "Manage event pages, registration, event forms and guest access in dedicated workspaces.",
    href: "/admin/events",
    disableImpact:
      "Event workspaces, public event pages and listings, new registrations, event forms, guest access and Luma event imports will pause. Saved event features and provider connections will stay configured. Existing bookings will not be cancelled; guests can still view and cancel their own native bookings.",
    enableImpact:
      "Previously published events and enabled event features will resume with their saved settings. Native registration and event forms also require Forms. No new event features are enabled by this change.",
  },
} satisfies Record<
  FeatureKey,
  {
    name: string;
    description: string;
    href: string;
    disableImpact: string;
    enableImpact: string;
  }
>;

export const featureChangeSchema = z.strictObject({
  key: featureKeySchema,
  enabled: z.boolean(),
  expectedVersion: z.number().int().min(0),
  confirmed: z.literal(true),
});

/** Presentation only. Services enforce the same current state on the server. */
export function featureForCapability(capability: string): FeatureKey | null {
  if (capability.startsWith("forms.") || capability.startsWith("submissions."))
    return "forms";
  if (capability.startsWith("events.")) return "events";
  if (capability.startsWith("calendar.")) return "calendar";
  return null;
}
