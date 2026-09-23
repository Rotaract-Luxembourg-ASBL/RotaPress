import { rotaryTemplateRecipes } from "./templates/rotary-template/definition";
import { rotaractTemplateRecipes } from "./templates/rotaract-template/definition";
import type { KitId, RecipeId } from "./catalogue";
import type { RecipeContext } from "./recipe_helpers";
import type { CmsData } from "../cms_schemas";

/** Stable IDs bind saved documents to an installed recipe family, not a separate renderer. */
export const templateRegistry = {
  "rotary-service": rotaryTemplateRecipes,
  "rotaract-action": rotaractTemplateRecipes,
} satisfies Record<
  KitId,
  Record<RecipeId, (context: RecipeContext) => CmsData>
>;
