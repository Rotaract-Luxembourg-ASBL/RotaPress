"use client";
import { useId, useState } from "react";
import { kits, kitRecipes, type KitId } from "../catalogue";
import { starterPages } from "../../page_templates";
import type { CmsLocale } from "../../cms_schemas";

/** A page layout adds one page; Templates sets up a complete website. */
export function TemplatePicker({
  disabled,
  kitId,
  locale,
}: {
  disabled: boolean;
  kitId?: KitId;
  locale: CmsLocale;
}) {
  const id = useId();
  const [selected, setSelected] = useState("blank");
  const preview = `/admin/website/preview?layout=${encodeURIComponent(selected)}&locale=${locale}`;
  return (
    <div className="page-layout-picker">
      <label htmlFor={id}>Page layout</label>
      <select
        id={id}
        name="templateId"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        disabled={disabled}
      >
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
      <p className="field-help">
        Adds one editable page. Choose a complete website in Templates.
      </p>
      {selected === "blank" ? (
        <div
          className="page-layout-empty"
          role="img"
          aria-label="Blank page preview"
        >
          <strong>Start with an empty canvas</strong>
          <span>Add blocks in the editor to build your page.</span>
        </div>
      ) : (
        <div className="page-layout-preview">
          <iframe
            key={preview}
            title="Selected page layout preview"
            src={`${preview}&inline=true`}
            sandbox="allow-same-origin allow-scripts"
          />
          <a href={preview} target="_blank" rel="noreferrer">
            Open full layout preview
          </a>
        </div>
      )}
    </div>
  );
}
