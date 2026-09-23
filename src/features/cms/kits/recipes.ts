import { templateRegistry } from "./template_registry";
import { defaultTemplateImages } from "./template_images";
import type { RecipeContext } from "./recipe_helpers";
import type { RecipeId } from "./catalogue";

export function copyKitRecipe(id: RecipeId, context: RecipeContext) {
  return templateRegistry[context.kit][id]({
    ...context,
    assets: context.assets ?? defaultTemplateImages,
  });
}
