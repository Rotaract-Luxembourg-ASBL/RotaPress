import type { CmsData } from "../../../cms_schemas";
import type { RecipeId } from "../../catalogue";
import type { RecipeContext } from "../../recipe_helpers";
import { homeRecipe, projectsRecipe } from "../../home_recipes";
import { siteRecipe } from "../../site_recipes";
import { catalogueRecipe } from "../../catalogue_recipes";

/** This template owns its recipe choices; shared functions compose registered CMS blocks. */
export const rotaractTemplateRecipes = {
  header: (context) => siteRecipe("header", context),
  footer: (context) => siteRecipe("footer", context),
  home: homeRecipe,
  projects: projectsRecipe,
  about: (context) => catalogueRecipe("about", context),
  "project-detail": (context) => catalogueRecipe("project-detail", context),
  events: (context) => catalogueRecipe("events", context),
  calendar: (context) => catalogueRecipe("calendar", context),
  team: (context) => catalogueRecipe("team", context),
  "event-detail": (context) => catalogueRecipe("event-detail", context),
  join: (context) => catalogueRecipe("join", context),
  contact: (context) => catalogueRecipe("contact", context),
  gallery: (context) => catalogueRecipe("gallery", context),
  partners: (context) => catalogueRecipe("partners", context),
  news: (context) => catalogueRecipe("news", context),
  story: (context) => catalogueRecipe("story", context),
  legal: (context) => catalogueRecipe("legal", context),
} satisfies Record<RecipeId, (context: RecipeContext) => CmsData>;
