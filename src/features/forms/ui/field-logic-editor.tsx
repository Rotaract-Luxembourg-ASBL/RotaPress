"use client";
import type { FormField } from "../form_schemas";
import type { Rule, RuleGroup } from "../form_logic";
import { hasOptions, isContentElement } from "../form_elements";

function initialRule(field: FormField): Rule {
  return {
    fieldId: field.id,
    operator: field.type === "multiselect" ? "contains" : "equals",
    value:
      field.type === "checkbox" || field.type === "consent"
        ? true
        : (field.options[0] ?? ""),
  };
}

function RulesEditor({
  title,
  value,
  earlier,
  onChange,
}: {
  title: string;
  value?: RuleGroup;
  earlier: FormField[];
  onChange: (next: RuleGroup | undefined) => void;
}) {
  function change(index: number, rule: Rule) {
    if (value)
      onChange({
        ...value,
        rules: value.rules.map((item, i) => (i === index ? rule : item)),
      });
  }
  return (
    <section className="form-stack forms-rule-group" aria-label={title}>
      <label className="forms-check">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={!earlier.length}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { mode: "all", rules: [initialRule(earlier[0])] }
                : undefined,
            )
          }
        />
        <span>{title}</span>
      </label>
      {!earlier.length && (
        <p className="field-help">Add an earlier question to build a rule.</p>
      )}
      {value && (
        <>
          <label>
            Match
            <select
              value={value.mode}
              onChange={(e) =>
                onChange({
                  ...value,
                  mode: e.target.value as RuleGroup["mode"],
                })
              }
            >
              <option value="all">All conditions (AND)</option>
              <option value="any">Any condition (OR)</option>
            </select>
          </label>
          {value.rules.map((rule, index) => {
            const source = earlier.find((field) => field.id === rule.fieldId);
            const boolean =
              source?.type === "checkbox" || source?.type === "consent";
            const multiple = source?.type === "multiselect";
            const needsValue =
              rule.operator !== "answered" && rule.operator !== "not_answered";
            return (
              <fieldset className="form-stack forms-rule" key={index}>
                <legend>Condition {index + 1}</legend>
                <label>
                  Question
                  <select
                    value={rule.fieldId}
                    onChange={(e) => {
                      const target = earlier.find(
                        (field) => field.id === e.target.value,
                      );
                      if (target) change(index, initialRule(target));
                    }}
                  >
                    {!source && (
                      <option value={rule.fieldId}>
                        Question no longer available
                      </option>
                    )}
                    {earlier.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Comparison
                  <select
                    value={rule.operator}
                    onChange={(e) => {
                      const operator = e.target.value as Rule["operator"];
                      change(
                        index,
                        operator === "answered" || operator === "not_answered"
                          ? { fieldId: rule.fieldId, operator }
                          : {
                              fieldId: rule.fieldId,
                              operator,
                              value:
                                rule.value ??
                                (boolean ? true : (source?.options[0] ?? "")),
                            },
                      );
                    }}
                  >
                    {!multiple && (
                      <>
                        <option value="equals">Is equal to</option>
                        <option value="not_equals">Is not equal to</option>
                      </>
                    )}
                    {!boolean && (
                      <option value="contains">
                        {multiple ? "Includes choice" : "Contains text"}
                      </option>
                    )}
                    {multiple && (
                      <option value="not_contains">
                        Does not include choice
                      </option>
                    )}
                    {source && ["number", "rating"].includes(source.type) && (
                      <>
                        <option value="greater_than">Is greater than</option>
                        <option value="less_than">Is less than</option>
                      </>
                    )}
                    <option value="answered">Has an answer</option>
                    <option value="not_answered">Has no answer</option>
                  </select>
                </label>
                {needsValue && (
                  <label>
                    Expected answer
                    {boolean ? (
                      <select
                        value={String(rule.value)}
                        onChange={(e) =>
                          change(index, {
                            ...rule,
                            value: e.target.value === "true",
                          })
                        }
                      >
                        <option value="true">Checked</option>
                        <option value="false">Not checked</option>
                      </select>
                    ) : source &&
                      hasOptions(source.type) &&
                      (multiple || rule.operator !== "contains") ? (
                      <select
                        value={String(rule.value ?? "")}
                        onChange={(e) =>
                          change(index, { ...rule, value: e.target.value })
                        }
                      >
                        {source.options.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={String(rule.value ?? "")}
                        maxLength={1000}
                        onChange={(e) =>
                          change(index, { ...rule, value: e.target.value })
                        }
                      />
                    )}
                  </label>
                )}
                {value.rules.length > 1 && (
                  <button
                    type="button"
                    className="inline-button"
                    onClick={() =>
                      onChange({
                        ...value,
                        rules: value.rules.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove condition {index + 1}
                  </button>
                )}
              </fieldset>
            );
          })}
          <button
            type="button"
            className="button button-outline"
            disabled={value.rules.length >= 6}
            onClick={() =>
              onChange({
                ...value,
                rules: [...value.rules, initialRule(earlier[0])],
              })
            }
          >
            Add condition
          </button>
        </>
      )}
    </section>
  );
}

export function FieldLogicEditor({
  field,
  earlier,
  onChange,
}: {
  field: FormField;
  earlier: FormField[];
  onChange: (field: FormField) => void;
}) {
  const visibility: RuleGroup | undefined =
    field.visibility ??
    (field.condition
      ? {
          mode: "all",
          rules: [
            {
              fieldId: field.condition.fieldId,
              operator: "equals",
              value: field.condition.equals,
            },
          ],
        }
      : undefined);
  const limits = field.validation ?? {};
  return (
    <>
      <details
        className="forms-advanced"
        open={Boolean(visibility || field.requiredWhen)}
      >
        <summary>
          Question rules{visibility || field.requiredWhen ? " · Enabled" : ""}
        </summary>
        <div className="forms-condition form-stack">
          <p className="field-help">
            Show a follow-up question or make an answer required based on
            earlier answers. Combine up to six conditions using All or Any.
          </p>
          <RulesEditor
            title="Show only when conditions match"
            earlier={earlier}
            value={visibility}
            onChange={(next) =>
              onChange({ ...field, condition: null, visibility: next })
            }
          />
          {!field.required && !isContentElement(field.type) && (
            <RulesEditor
              title="Require an answer when conditions match"
              earlier={earlier}
              value={field.requiredWhen}
              onChange={(next) => onChange({ ...field, requiredWhen: next })}
            />
          )}
        </div>
      </details>
      {["number", "text", "textarea", "email", "phone", "url"].includes(
        field.type,
      ) && (
        <details className="forms-advanced">
          <summary>Answer validation</summary>
          <div className="forms-two-fields">
            {(field.type === "number"
              ? [
                  ["minimum", "Minimum value"],
                  ["maximum", "Maximum value"],
                ]
              : [
                  ["minLength", "Minimum characters"],
                  ["maxLength", "Maximum characters"],
                ]
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  value={limits[key as keyof typeof limits] ?? ""}
                  step={field.type === "number" ? "any" : 1}
                  min={
                    field.type === "number"
                      ? undefined
                      : key === "maxLength"
                        ? 1
                        : 0
                  }
                  max={field.type === "number" ? undefined : 10000}
                  onChange={(e) =>
                    onChange({
                      ...field,
                      validation: {
                        ...limits,
                        [key]:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
