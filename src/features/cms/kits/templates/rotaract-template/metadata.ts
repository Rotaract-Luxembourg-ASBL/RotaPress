import type { RecipeId } from "../../catalogue";

export const rotaractTemplateMetadata = {
  name: "Rotaract Template",
  family: "Rotaract",
  description:
    "An activity-led website with a welcoming split introduction, upcoming events, connected community content and a masonry photo gallery.",
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
