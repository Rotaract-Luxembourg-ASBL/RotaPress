"use client";
import { kits, kitRecipes, type KitId } from "../catalogue";
import { starterPages } from "../../page_templates";

/** A page layout adds one page; Templates sets up a complete website. */
export function TemplatePicker({
  disabled,
  kitId,
}: {
  disabled: boolean;
  kitId?: KitId;
}) {
  return (
    <label>
      Page layout
      <select name="templateId" defaultValue="blank" disabled={disabled}>
        <option value="blank">Blank page</option>
        {kitId ? (
          <optgroup label={`${kits[kitId].name} layouts`}>
            {kitRecipes
              .filter(
                (recipe) => recipe.id !== "header" && recipe.id !== "footer",
              )
              .map((recipe) => (
                <option key={recipe.id} value={`${kitId}:${recipe.id}`}>
                  {recipe.name}
                </option>
              ))}
          </optgroup>
        ) : (
          <optgroup label="Starter layouts">
            {starterPages.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.title}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <span className="field-help">
        Adds one editable page. Choose a complete website in Templates.
      </span>
    </label>
  );
}
