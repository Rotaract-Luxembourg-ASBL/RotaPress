"use client";

import type { CustomField } from "@puckeditor/core";

export const imageWidthField: CustomField<number | undefined> = {
  type: "custom",
  label: "Custom image width",
  render: ({ value, onChange, readOnly }) => (
    <div className="editor-image-width-field">
      <label>
        Width in pixels
        <input
          type="number"
          min={0}
          max={2400}
          step={1}
          value={value ?? 0}
          disabled={readOnly}
          onChange={(event) => {
            const width = event.currentTarget.valueAsNumber;
            if (Number.isFinite(width))
              onChange(Math.max(0, Math.min(2400, Math.round(width))));
          }}
        />
      </label>
      <button
        type="button"
        disabled={readOnly || !value}
        onClick={() => onChange(0)}
      >
        Use width preset
      </button>
      <p className="field-help">
        Drag a selected image handle or enter a width. Zero uses the preset;
        images always fit smaller screens.
      </p>
    </div>
  ),
};

function flipField(label: string): CustomField<boolean | undefined> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => (
      <label className="editor-image-flip-field">
        <input
          type="checkbox"
          checked={value ?? false}
          disabled={readOnly}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        {label}
      </label>
    ),
  };
}

export const flipHorizontalField = flipField("Flip horizontally");
export const flipVerticalField = flipField("Flip vertically");
