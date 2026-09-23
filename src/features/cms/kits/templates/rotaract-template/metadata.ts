import type { RecipeId } from "../../catalogue";

export const rotaractTemplateMetadata = {
  name: "Rotaract Template",
  family: "Rotaract",
  description:
    "A welcoming website with cranberry accents, a community calendar, events, contact form and shared directory profiles.",
  websiteRecipes: [
    "header",
    "footer",
    "home",
    "about",
    "projects",
    "project-detail",
    "events",
    "calendar",
    "team",
    "join",
    "contact",
    "gallery",
    "partners",
  ] as const satisfies readonly RecipeId[],
  menuRecipes: [
    "home",
    "about",
    "projects",
    "events",
    "calendar",
    "join",
    "contact",
  ] as const satisfies readonly RecipeId[],
};
