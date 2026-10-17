"use client";

import { useId } from "react";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function fieldLabel(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

/** Simple schema fields have native controls; complex structures retain the JSON editor. */
export function OperationInput({
  schema,
  value,
  onChange,
  disabled,
}: {
  schema: Record<string, unknown>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  let input: Record<string, unknown> | null = null;
  try {
    input = record(JSON.parse(value));
  } catch {
    /* Raw edits are preserved. */
  }
  const properties = record(schema.properties) ?? {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const fields = Object.entries(properties).filter(([, raw]) => {
    const property = record(raw);
    return (
      property &&
      ["string", "integer", "number", "boolean"].includes(String(property.type))
    );
  });
  function update(name: string, next: unknown) {
    if (!input) return;
    const values = { ...input };
    if (next === undefined) delete values[name];
    else values[name] = next;
    onChange(JSON.stringify(values, null, 2));
  }
  const complex = Object.keys(properties).length - fields.length;
  return (
    <div className="automation-input-fields">
      {input &&
        fields.map(([name, raw]) => {
          const property = record(raw)!;
          const current = input![name] ?? property.default;
          const options = Array.isArray(property.enum)
            ? property.enum.filter(
                (item): item is string => typeof item === "string",
              )
            : [];
          const mandatory = required.includes(name);
          return (
            <label key={name} htmlFor={`${id}-${name}`}>
              <span>
                {fieldLabel(name)}
                {mandatory ? "" : " (optional)"}
              </span>
              {property.type === "boolean" ? (
                <select
                  id={`${id}-${name}`}
                  disabled={disabled}
                  value={current === undefined ? "" : String(current)}
                  onChange={(event) =>
                    update(
                      name,
                      event.target.value === ""
                        ? undefined
                        : event.target.value === "true",
                    )
                  }
                >
                  {!mandatory && <option value="">Use default</option>}
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : options.length ? (
                <select
                  id={`${id}-${name}`}
                  disabled={disabled}
                  value={typeof current === "string" ? current : ""}
                  required={mandatory}
                  onChange={(event) =>
                    update(name, event.target.value || undefined)
                  }
                >
                  <option value="">
                    {mandatory ? "Choose…" : "Use default"}
                  </option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {fieldLabel(option)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${id}-${name}`}
                  type={property.type === "string" ? "text" : "number"}
                  value={
                    typeof current === "string" || typeof current === "number"
                      ? current
                      : ""
                  }
                  disabled={disabled}
                  required={mandatory}
                  min={
                    typeof property.minimum === "number"
                      ? property.minimum
                      : undefined
                  }
                  max={
                    typeof property.maximum === "number"
                      ? property.maximum
                      : undefined
                  }
                  step={property.type === "integer" ? 1 : "any"}
                  maxLength={
                    typeof property.maxLength === "number"
                      ? property.maxLength
                      : undefined
                  }
                  onChange={(event) =>
                    update(
                      name,
                      property.type === "string"
                        ? event.target.value
                        : event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                    )
                  }
                />
              )}
              {typeof property.description === "string" && (
                <small className="field-help">{property.description}</small>
              )}
            </label>
          );
        })}
      {Object.keys(properties).length === 0 && (
        <p className="field-help">This action needs no input.</p>
      )}
      {complex > 0 && (
        <p className="field-help">
          This action includes structured content. Edit those fields in the
          advanced input below.
        </p>
      )}
      <details open={!input || complex > 0}>
        <summary>Advanced input (JSON)</summary>
        <label>
          Request input (JSON)
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={12}
            spellCheck={false}
            disabled={disabled}
          />
        </label>
      </details>
    </div>
  );
}
