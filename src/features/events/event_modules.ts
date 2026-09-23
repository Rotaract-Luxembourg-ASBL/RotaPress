import { z } from "zod";
import { eventVersionSchema } from "./event_schemas";

export const eventPageModuleKeySchema = z.enum([
  "website",
  "gallery",
  "sponsors",
]);
export type EventPageModuleKey = z.infer<typeof eventPageModuleKeySchema>;
export const eventModuleKeySchema = z.enum([
  "website",
  "gallery",
  "sponsors",
  "forms",
  "registration",
  "portal",
  "prizes",
]);
export type EventModuleKey = z.infer<typeof eventModuleKeySchema>;
export const eventModules = {
  website: {
    label: "Website",
    description: "Publish a landing page in each event language.",
    dependencies: [],
  },
  gallery: {
    label: "Gallery",
    description: "Share selected public photographs on an event page.",
    dependencies: ["website"],
  },
  sponsors: {
    label: "Sponsors",
    description: "Publish sponsor names, logos and links.",
    dependencies: ["website"],
  },
  forms: {
    label: "Forms",
    description: "Publish event forms and review private responses.",
    dependencies: ["website"],
  },
  registration: {
    label: "Registration",
    description: "Use native free registration or a published Luma link.",
    dependencies: ["website"],
  },
  portal: {
    label: "Guest portal",
    description:
      "Give selected guests private access to their own booking and published event details.",
    dependencies: ["website"],
  },
  prizes: {
    label: "Prizes",
    description: "Manage and publish a prize showcase with images and donors.",
    dependencies: ["website"],
  },
} satisfies Record<
  EventModuleKey,
  { label: string; description: string; dependencies: EventModuleKey[] }
>;
export const moduleChangeSchema = eventVersionSchema.extend({
  key: eventModuleKeySchema,
  operation: z.enum(["enable", "disable"]),
  confirmed: z.literal(true),
  suspendDependents: z.boolean().default(false),
});
export type EventModuleState = {
  key: EventModuleKey;
  state: "enabled" | "disabled" | "suspended";
};

// These are approved subsets of the existing shared CMS schema, not theme blocks.
export const eventBlockTypes: Record<EventPageModuleKey, readonly string[]> = {
  website: [
    "Calendar",
    "EventHero",
    "EventPractical",
    "EventImpact",
    "EventFooter",
    "EventContact",
    "EventFlyer",
    "EventShare",
    "EventPackages",
    "EventPrizes",
    "EventWinners",
    "Form",
    "EventRegistration",
    "PageIntro",
    "Hero",
    "HeroSlider",
    "FeatureSection",
    "Programme",
    "ParticipationOptions",
    "EventCollection",
    "Cover",
    "Gallery",
    "ImageSlider",
    "CallToAction",
    "FAQ",
    "Divider",
    "Spacer",
    "Heading",
    "RichText",
    "Image",
    "Button",
    "Cards",
    "Team",
    "PartnerCollection",
  ],
  gallery: ["Heading", "RichText", "Gallery", "ImageSlider", "Image", "Button"],
  sponsors: [
    "Heading",
    "RichText",
    "Sponsors",
    "PartnerCollection",
    "Image",
    "Button",
  ],
};
