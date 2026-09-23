"use client";

import { useId } from "react";
import type { FormField } from "../form_schemas";
import { fieldIsVisible, fieldIsRequired } from "../form_schemas";
import { isContentElement, type AnswerValue } from "../form_elements";

export type FormAnswers = Record<string, AnswerValue>;

export function visibleFields(fields: FormField[], answers: FormAnswers) {
  const visibleAnswers: FormAnswers = {};
  const available = new Set<string>();
  return fields.filter((field) => {
    const visible = fieldIsVisible(field, visibleAnswers, available);
    if (visible && !isContentElement(field.type)) {
      available.add(field.id);
      const value = answers[field.id];
      if (field.type === "checkbox" || field.type === "consent") {
        visibleAnswers[field.id] = value === true;
      } else if (typeof value === "string" && value.trim()) {
        visibleAnswers[field.id] = value.trim();
      } else if (Array.isArray(value)) {
        visibleAnswers[field.id] = field.options.filter((option) =>
          value.includes(option),
        );
      }
    }
    return visible;
  });
}

export function PublicFields({
  fields,
  answers,
  onChange,
  disabled = false,
  layout = "stacked",
  shownIds,
}: {
  fields: FormField[];
  answers: FormAnswers;
  onChange: (id: string, value: AnswerValue) => void;
  disabled?: boolean;
  layout?: "stacked" | "two-column";
  shownIds?: string[];
}) {
  const prefix = useId();
  const visible = visibleFields(fields, answers);
  const accepted: FormAnswers = {};
  for (const field of visible) {
    const value = answers[field.id];
    if (isContentElement(field.type)) continue;
    if (field.type === "checkbox" || field.type === "consent")
      accepted[field.id] = value === true;
    else if (typeof value === "string" && value.trim())
      accepted[field.id] = value.trim();
    else if (Array.isArray(value))
      accepted[field.id] = field.options.filter((option) =>
        value.includes(option),
      );
  }
  const available = new Set(
    visible
      .filter((field) => !isContentElement(field.type))
      .map((field) => field.id),
  );
  return (
    <div className="forms-fields" data-layout={layout}>
      {visible
        .filter((field) => !shownIds || shownIds.includes(field.id))
        .map((original) => {
          const field = {
            ...original,
            required: fieldIsRequired(original, accepted, available),
          };
          const id = `${prefix}-${field.id}`;
          const helpId = field.description ? `${id}-help` : undefined;
          const common = {
            id,
            name: field.id,
            required: field.required,
            disabled,
            "aria-describedby": helpId,
          };
          const value = answers[field.id];
          const className =
            field.width === "half"
              ? "forms-field-half"
              : field.width === "full" ||
                  [
                    "textarea",
                    "heading",
                    "radio",
                    "multiselect",
                    "rating",
                  ].includes(field.type)
                ? "forms-field-full"
                : undefined;
          if (field.type === "page_break") return null;
          if (field.type === "heading")
            return (
              <div key={field.id} className="forms-field-full forms-section">
                <h3>{field.label}</h3>
                {field.description && <p>{field.description}</p>}
              </div>
            );
          if (["radio", "multiselect", "rating"].includes(field.type)) {
            const multiple = field.type === "multiselect";
            const options =
              field.type === "rating"
                ? Array.from({ length: field.ratingScale ?? 5 }, (_, i) =>
                    String(i + 1),
                  )
                : field.options;
            const selected = Array.isArray(value) ? value : [];
            return (
              <fieldset
                key={field.id}
                className={`forms-choice-group ${className ?? ""}`}
                disabled={disabled}
                aria-describedby={helpId}
              >
                <legend>
                  {field.label}
                  {field.required && (
                    <span className="forms-required"> (required)</span>
                  )}
                </legend>
                <div
                  className={
                    field.type === "rating"
                      ? "forms-rating"
                      : "forms-choice-options"
                  }
                >
                  {options.map((option, index) => (
                    <label key={option} className="forms-check">
                      <input
                        type={multiple ? "checkbox" : "radio"}
                        name={`${prefix}-${field.id}`}
                        value={option}
                        required={
                          field.required &&
                          (!multiple || (!selected.length && index === 0))
                        }
                        checked={
                          multiple
                            ? selected.includes(option)
                            : value === option
                        }
                        onChange={(event) =>
                          onChange(
                            field.id,
                            multiple
                              ? field.options.filter((item) =>
                                  item === option
                                    ? event.target.checked
                                    : selected.includes(item),
                                )
                              : option,
                          )
                        }
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
                {field.description && (
                  <p id={helpId} className="field-help">
                    {field.description}
                  </p>
                )}
              </fieldset>
            );
          }
          if (field.type === "checkbox" || field.type === "consent")
            return (
              <div key={field.id} className="forms-field-full">
                <label className="forms-check" htmlFor={id}>
                  <input
                    {...common}
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) =>
                      onChange(field.id, event.target.checked)
                    }
                  />
                  <span>
                    {field.label}
                    {field.required && (
                      <span className="forms-required"> (required)</span>
                    )}
                  </span>
                </label>
                {field.description && (
                  <p className="field-help" id={helpId}>
                    {field.description}
                  </p>
                )}
              </div>
            );
          return (
            <label key={field.id} htmlFor={id} className={className}>
              <span>
                {field.label}
                {field.required && (
                  <span className="forms-required"> (required)</span>
                )}
              </span>
              {field.type === "textarea" ? (
                <textarea
                  {...common}
                  rows={5}
                  placeholder={field.placeholder}
                  minLength={field.validation?.minLength}
                  maxLength={field.validation?.maxLength ?? 10000}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => onChange(field.id, event.target.value)}
                />
              ) : field.type === "choice" ? (
                <select
                  {...common}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => onChange(field.id, event.target.value)}
                >
                  <option value="">Choose an option</option>
                  {field.options.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...common}
                  placeholder={field.placeholder}
                  maxLength={
                    field.validation?.maxLength ??
                    (field.type === "email"
                      ? 254
                      : field.type === "phone"
                        ? 80
                        : 1000)
                  }
                  type={field.type === "phone" ? "tel" : field.type}
                  min={
                    field.type === "number"
                      ? field.validation?.minimum
                      : undefined
                  }
                  max={
                    field.type === "number"
                      ? field.validation?.maximum
                      : undefined
                  }
                  step={field.type === "number" ? "any" : undefined}
                  minLength={field.validation?.minLength}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => onChange(field.id, event.target.value)}
                />
              )}
              {field.description && (
                <span className="field-help" id={helpId}>
                  {field.description}
                </span>
              )}
            </label>
          );
        })}
    </div>
  );
}
