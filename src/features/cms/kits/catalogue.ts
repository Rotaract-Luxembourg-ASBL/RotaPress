import { z } from "zod";
import { rotaryTemplateMetadata } from "./templates/rotary-template/metadata";
import { rotaractTemplateMetadata } from "./templates/rotaract-template/metadata";

export const kitIdSchema = z.enum(["rotary-service", "rotaract-action"]);
export type KitId = z.infer<typeof kitIdSchema>;
export const recipeIdSchema = z.enum([
  "header",
  "footer",
  "home",
  "about",
  "projects",
  "project-detail",
  "events",
  "calendar",
  "team",
  "event-detail",
  "join",
  "contact",
  "gallery",
  "partners",
  "news",
  "story",
  "legal",
]);
export type RecipeId = z.infer<typeof recipeIdSchema>;
export const kitRecipes: {
  id: RecipeId;
  name: string;
  description: string;
  optional?: boolean;
}[] = [
  {
    id: "header",
    name: "Shared header",
    description: "Club identity, shared menu, member login and invitation.",
  },
  {
    id: "footer",
    name: "Shared footer",
    description: "Identity, navigation, contact and social columns.",
  },
  {
    id: "home",
    name: "Home",
    description:
      "An image-led introduction, projects, activities and an invitation.",
  },
  {
    id: "about",
    name: "About",
    description: "Purpose, values and a readable club story.",
  },
  {
    id: "projects",
    name: "Projects",
    description: "A compact introduction and selected published project pages.",
  },
  {
    id: "project-detail",
    name: "Project detail",
    description: "The idea, objectives, story, photography and ways to help.",
  },
  {
    id: "events",
    name: "Events",
    description: "The existing automatically updated public event feed.",
  },
  {
    id: "calendar",
    name: "Calendar",
    description:
      "Published calendars, recurring activities and connected events.",
  },
  {
    id: "team",
    name: "Our team",
    description: "Published team profiles from the shared directory.",
  },
  {
    id: "event-detail",
    name: "Event detail",
    description:
      "Programme and practical information; copy into an event Website for registration.",
  },
  {
    id: "join",
    name: "Join",
    description:
      "Benefits, expectations, application steps and your membership form.",
  },
  {
    id: "contact",
    name: "Contact",
    description:
      "A conversation-led introduction and your published Contact form.",
  },
  {
    id: "gallery",
    name: "Gallery",
    description:
      "Captioned photographs and a manually controlled image slider.",
  },
  {
    id: "partners",
    name: "Partners",
    description: "Managed partner profiles and a sponsorship invitation.",
  },
  {
    id: "news",
    name: "News",
    description: "Curated published stories from the same CMS.",
    optional: true,
  },
  {
    id: "story",
    name: "Story",
    description: "A readable article, lead image and related stories.",
    optional: true,
  },
  {
    id: "legal",
    name: "Legal page",
    description: "A draft layout requiring the club's own reviewed text.",
    optional: true,
  },
];
export const kits = {
  "rotary-service": rotaryTemplateMetadata,
  "rotaract-action": rotaractTemplateMetadata,
} as const;
