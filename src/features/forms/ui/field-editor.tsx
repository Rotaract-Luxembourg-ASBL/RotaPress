"use client";

import { FieldLogicEditor } from "./field-logic-editor";
import { fieldTypes, type FormField } from "../form_schemas";
import {
  hasOptions,
  isContentElement,
  MAX_FORM_ELEMENTS,
} from "../form_elements";

export const fieldLabels: Record<FormField["type"], string> = {
  text: "Short text",
  email: "Email address",
  phone: "Phone number",
  textarea: "Long text",
  choice: "Choice",
  checkbox: "Checkbox",
  date: "Date",
  consent: "Consent",
  number: "Number",
  radio: "Single choice",
  multiselect: "Multiple choice",
  url: "Website address",
  time: "Time",
  rating: "Rating",
  heading: "Heading & text",
  page_break: "Page break",
};

export function FieldEditor({
  field,
  earlier,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
}: {
  field: FormField;
  earlier: FormField[];
  index: number;
  count: number;
  disabled: boolean;
  onChange: (next: FormField) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  return (
    <details className="forms-field-editor" open>
      <summary>
        <span>
          {index + 1}. {field.label || "Untitled field"}
        </span>
        <span className="forms-badge">{fieldLabels[field.type]}</span>
      </summary>
      <fieldset disabled={disabled} className="form-stack forms-fieldset">
        <div className="forms-two-fields">
          <label>
            Field label
            <input
              value={field.label}
              maxLength={200}
              onChange={(event) =>
                onChange({ ...field, label: event.target.value })
              }
            />
          </label>
          <label>
            Field type
            <select
              value={field.type}
              onChange={(event) => {
                const type = event.target.value as FormField["type"];
                onChange({
                  ...field,
                  type,
                  validation: undefined,
                  ratingScale: undefined,
                  required: isContentElement(type) ? false : field.required,
                  requiredWhen: isContentElement(type)
                    ? undefined
                    : field.requiredWhen,
                  visibility:
                    type === "page_break" ? undefined : field.visibility,
                  condition: type === "page_break" ? null : field.condition,
                  options: hasOptions(type)
                    ? field.options.length
                      ? field.options
                      : ["First option", "Second option"]
                    : [],
                });
              }}
            >
              {fieldTypes.map((type) => (
                <option key={type} value={type}>
                  {fieldLabels[type]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Help text
          <textarea
            rows={2}
            maxLength={1500}
            value={field.description}
            onChange={(event) =>
              onChange({ ...field, description: event.target.value })
            }
          />
        </label>
        {hasOptions(field.type) && (
          <label>
            Choices, one per line
            <textarea
              rows={4}
              value={field.options.join("\n")}
              onChange={(event) =>
                onChange({ ...field, options: event.target.value.split("\n") })
              }
            />
            <span className="field-help">
              Use up to 30 distinct choices. Remove empty lines before saving.
            </span>
          </label>
        )}
        {!isContentElement(field.type) && (
          <label className="forms-check">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) =>
                onChange({ ...field, required: event.target.checked })
              }
            />
            <span>
              {field.type === "consent"
                ? "Consent is required"
                : "Answer is required"}
            </span>
          </label>
        )}
        {field.type === "rating" && (
          <label>
            Rating scale
            <select
              value={field.ratingScale ?? 5}
              onChange={(event) =>
                onChange({
                  ...field,
                  ratingScale: Number(event.target.value) as 5 | 10,
                })
              }
            >
              <option value={5}>1 to 5</option>
              <option value={10}>1 to 10</option>
            </select>
          </label>
        )}
        {!isContentElement(field.type) && (
          <div className="form-stack">
            <label>
              Question width
              <select
                value={field.width ?? "auto"}
                onChange={(event) =>
                  onChange({
                    ...field,
                    width: event.target.value as FormField["width"],
                  })
                }
              >
                <option value="auto">Use form layout</option>
                <option value="full">Full width</option>
                <option value="half">Half width on wide screens</option>
              </select>
            </label>
            {["text", "textarea", "email", "phone", "url", "number"].includes(
              field.type,
            ) && (
              <label>
                Placeholder
                <input
                  maxLength={160}
                  value={field.placeholder ?? ""}
                  onChange={(event) =>
                    onChange({ ...field, placeholder: event.target.value })
                  }
                />
                <span className="field-help">
                  An example answer. The label stays visible.
                </span>
              </label>
            )}
          </div>
        )}
        {field.type === "consent" && (
          <p className="field-help">
            Write the exact consent wording in the field label and help text.
            The published wording is kept with each submission.
          </p>
        )}
        {field.type !== "page_break" && (
          <FieldLogicEditor
            field={field}
            earlier={earlier.filter((item) => !isContentElement(item.type))}
            onChange={onChange}
          />
        )}
        <div className="forms-field-tools">
          <button
            type="button"
            disabled={count >= MAX_FORM_ELEMENTS}
            onClick={onDuplicate}
            aria-label={`Duplicate ${field.label || "field"}`}
          >
            Duplicate field
          </button>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${field.label || "field"} up`}
          >
            Move up
          </button>
          <button
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${field.label || "field"} down`}
          >
            Move down
          </button>
          <button
            type="button"
            disabled={count <= 1}
            onClick={onRemove}
            aria-label={`Remove ${field.label || "field"}`}
          >
            Remove field
          </button>
        </div>
      </fieldset>
    </details>
  );
}
