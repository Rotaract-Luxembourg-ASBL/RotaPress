"use client";
import type { FormDefinition } from "../form_schemas";
import { DraftPreview } from "./form-edit-panels";

export function FormDesignPanel({
  draft,
  disabled,
  onChange,
}: {
  draft: FormDefinition;
  disabled: boolean;
  onChange: (next: FormDefinition) => void;
}) {
  const appearance = draft.appearance ?? {
    theme: "club",
    corners: "rounded",
    density: "comfortable",
  };
  return (
    <div className="form-design-layout">
      <fieldset className="panel form-stack forms-fieldset" disabled={disabled}>
        <h2>Form design</h2>
        <p className="muted">
          Style this form. The same design appears in your preview, public link
          and website block.
        </p>
        <div
          className="form-theme-choices"
          role="group"
          aria-label="Color theme"
        >
          {(
            [
              ["club", "Club colors"],
              ["paper", "Paper"],
              ["ocean", "Ocean"],
              ["plum", "Plum"],
            ] as const
          ).map(([theme, label]) => (
            <button
              key={theme}
              type="button"
              aria-pressed={appearance.theme === theme}
              data-theme={theme}
              onClick={() =>
                onChange({ ...draft, appearance: { ...appearance, theme } })
              }
            >
              <span />
              {label}
            </button>
          ))}
        </div>
        <label>
          Field corners
          <select
            value={appearance.corners}
            onChange={(event) =>
              onChange({
                ...draft,
                appearance: {
                  ...appearance,
                  corners: event.target.value as "rounded" | "square",
                },
              })
            }
          >
            <option value="rounded">Rounded</option>
            <option value="square">Square</option>
          </select>
        </label>
        <label>
          Spacing
          <select
            value={appearance.density}
            onChange={(event) =>
              onChange({
                ...draft,
                appearance: {
                  ...appearance,
                  density: event.target.value as "comfortable" | "compact",
                },
              })
            }
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <p className="field-help">
          Save your draft, then publish to update the design visitors see.
        </p>
      </fieldset>
      <DraftPreview definition={draft} />
    </div>
  );
}
