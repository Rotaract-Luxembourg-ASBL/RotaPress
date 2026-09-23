import { z } from "zod";
import type { EventDesign } from "./event_design";

export const eventLayoutIdSchema = z.enum([
  "reference",
  "gala",
  "conference",
  "networking",
  "service",
  "workshop",
  "festival",
  "fundraiser",
  "sports",
  "celebration",
]);
export type EventLayoutId = z.infer<typeof eventLayoutIdSchema>;
type Layout = {
  id: EventLayoutId;
  name: string;
  description: string;
  badge: string;
  tagline: string;
  primary: string;
  background: string;
  font: EventDesign["font"];
  layout: "centered" | "left" | "split";
  height: "compact" | "full";
  spacing: NonNullable<EventDesign["spacing"]>;
  corners: NonNullable<EventDesign["corners"]>;
  sections: readonly string[];
};

/** Copy-only examples: never activates features or invents people, bookings or totals. */
export const eventLayouts: readonly Layout[] = [
  {
    id: "reference",
    name: "Rotaract signature",
    description:
      "The reference event: a full-screen invitation, programme, impact and warm gold details.",
    badge: "You are invited",
    tagline: "An evening of connection. A wave of change.",
    primary: "#8B4B00",
    background: "#F5EFE2",
    font: "modern",
    layout: "centered",
    height: "full",
    spacing: "comfortable",
    corners: "rounded",
    sections: [
      "programme",
      "impact",
      "partners",
      "practical",
      "faq",
      "contact",
      "share",
    ],
  },
  {
    id: "gala",
    name: "Gala evening",
    description:
      "A classic invitation with generous space, a formal programme and a project story.",
    badge: "An invitation to come together",
    tagline: "A memorable evening. A shared purpose.",
    primary: "#79501D",
    background: "#FBF5E9",
    font: "classic",
    layout: "centered",
    height: "full",
    spacing: "airy",
    corners: "square",
    sections: [
      "story",
      "programme",
      "impact",
      "sponsors",
      "practical",
      "contact",
    ],
  },
  {
    id: "conference",
    name: "Conference & talks",
    description:
      "A bold split introduction, agenda and connected speaker profiles.",
    badge: "Ideas worth sharing",
    tagline: "Meet the people shaping what comes next.",
    primary: "#2453A6",
    background: "#F1F5FC",
    font: "modern",
    layout: "split",
    height: "compact",
    spacing: "comfortable",
    corners: "square",
    sections: [
      "programme",
      "team",
      "story",
      "partners",
      "practical",
      "faq",
      "contact",
    ],
  },
  {
    id: "networking",
    name: "Community mixer",
    description:
      "A compact, welcoming page with the essentials and a simple evening schedule.",
    badge: "Make a new connection",
    tagline: "Good conversations start here.",
    primary: "#8C3971",
    background: "#FCF3F9",
    font: "modern",
    layout: "left",
    height: "compact",
    spacing: "compact",
    corners: "soft",
    sections: ["story", "practical", "programme", "team", "contact", "share"],
  },
  {
    id: "service",
    name: "Community action",
    description:
      "Lead with the cause, practical volunteer guidance and your organizing team.",
    badge: "Small actions. Shared progress.",
    tagline: "Give your time. Make a difference together.",
    primary: "#25664B",
    background: "#F0F6EF",
    font: "modern",
    layout: "split",
    height: "compact",
    spacing: "comfortable",
    corners: "rounded",
    sections: [
      "impact",
      "programme",
      "practical",
      "team",
      "faq",
      "partners",
      "contact",
    ],
  },
  {
    id: "workshop",
    name: "Hands-on workshop",
    description:
      "A focused learning page: outcomes, session plan, facilitators and things to bring.",
    badge: "Learn by doing",
    tagline: "Bring your curiosity. Leave with new skills.",
    primary: "#75501C",
    background: "#FFF8E8",
    font: "modern",
    layout: "left",
    height: "compact",
    spacing: "compact",
    corners: "rounded",
    sections: ["story", "programme", "team", "practical", "faq", "contact"],
  },
  {
    id: "festival",
    name: "Community festival",
    description:
      "A colourful full-screen welcome with highlights, a gallery and the day's programme.",
    badge: "A day to come together",
    tagline: "Music, discovery and moments to remember.",
    primary: "#A33C24",
    background: "#FFF3E5",
    font: "modern",
    layout: "centered",
    height: "full",
    spacing: "airy",
    corners: "soft",
    sections: [
      "programme",
      "gallery",
      "partners",
      "practical",
      "faq",
      "contact",
      "share",
    ],
  },
  {
    id: "fundraiser",
    name: "Purpose & impact",
    description:
      "An editorial layout that puts the project first and explains how guests can help.",
    badge: "Together for a cause",
    tagline: "Turn a shared moment into lasting support.",
    primary: "#853C40",
    background: "#FBF2EE",
    font: "classic",
    layout: "split",
    height: "full",
    spacing: "airy",
    corners: "rounded",
    sections: [
      "impact",
      "story",
      "programme",
      "sponsors",
      "practical",
      "faq",
      "contact",
      "share",
    ],
  },
  {
    id: "sports",
    name: "Move together",
    description:
      "An energetic start, a clear running order and practical information for participants.",
    badge: "Every step brings us together",
    tagline: "Move with purpose. Finish as a community.",
    primary: "#156578",
    background: "#EDF7F8",
    font: "modern",
    layout: "left",
    height: "full",
    spacing: "compact",
    corners: "square",
    sections: [
      "programme",
      "practical",
      "impact",
      "sponsors",
      "faq",
      "contact",
      "share",
    ],
  },
  {
    id: "celebration",
    name: "Anniversary & celebration",
    description:
      "An elegant story-led page with a photo gallery, your people and a closing invitation.",
    badge: "Celebrate the journey",
    tagline: "Our story continues with you.",
    primary: "#654C90",
    background: "#F6F2FB",
    font: "classic",
    layout: "centered",
    height: "full",
    spacing: "airy",
    corners: "soft",
    sections: [
      "story",
      "gallery",
      "team",
      "programme",
      "partners",
      "practical",
      "contact",
      "share",
    ],
  },
];

export function eventLayout(id: EventLayoutId) {
  return eventLayouts.find((layout) => layout.id === id)!;
}
