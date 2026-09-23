import { createHash } from "node:crypto";
import { z } from "zod";
import {
  answerText,
  hasOptions,
  isContentElement,
  type AnswerValue,
} from "./form_elements";
import { DomainError } from "../../core/authorization/AuthorizationService";
import {
  fieldIsVisible,
  fieldIsRequired,
  type FormAnswers,
  type FormDefinition,
  type FormField,
} from "./form_schemas";

function invalid(field?: FormField): never {
  throw new DomainError(
    "FORM_ANSWERS_INVALID",
    field
      ? `Check the answer for “${field.label}”.`
      : "This response includes an unknown or hidden field.",
    422,
  );
}

/** Conditions see only accepted earlier answers, never untrusted hidden answers. */
export function validateAnswers(
  definition: FormDefinition,
  input: FormAnswers,
): FormAnswers {
  const answers: FormAnswers = {};
  const available = new Set<string>();
  const allowed = new Set(definition.fields.map((field) => field.id));
  if (Object.keys(input).some((key) => !allowed.has(key))) invalid();
  for (const field of definition.fields) {
    const value = input[field.id];
    if (isContentElement(field.type)) {
      if (value !== undefined) invalid();
      continue;
    }
    if (!fieldIsVisible(field, answers, available)) {
      if (value !== undefined) invalid();
      continue;
    }
    const required = fieldIsRequired(field, answers, available);
    available.add(field.id);
    if (field.type === "multiselect") {
      if (
        value !== undefined &&
        (!Array.isArray(value) ||
          value.some((option) => !field.options.includes(option)))
      )
        invalid(field);
      const values = Array.isArray(value) ? value : [];
      if (
        new Set(values).size !== values.length ||
        (required && !values.length)
      )
        invalid(field);
      // Canonical option order makes retries independent of checkbox click order.
      answers[field.id] = field.options.filter((option) =>
        values.includes(option),
      );
      continue;
    }
    if (field.type === "checkbox" || field.type === "consent") {
      if (value !== undefined && typeof value !== "boolean") invalid(field);
      if (required && value !== true) invalid(field);
      answers[field.id] = value ?? false;
      continue;
    }
    if (value !== undefined && typeof value !== "string") invalid(field);
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (required) invalid(field);
      continue;
    }
    if (
      [...text].some((character) => {
        const code = character.charCodeAt(0);
        return (
          (code < 32 && character !== "\n" && character !== "\t") ||
          code === 127
        );
      })
    )
      invalid(field);
    const max =
      field.type === "textarea"
        ? 10000
        : field.type === "email"
          ? 254
          : field.type === "phone"
            ? 80
            : 1000;
    if (text.length > max) invalid(field);
    if (
      text.length < (field.validation?.minLength ?? 0) ||
      text.length > (field.validation?.maxLength ?? Infinity)
    )
      invalid(field);
    if (field.type === "number") {
      if (
        !/^-?(?:\d+\.?\d*|\.\d+)$/.test(text) ||
        !Number.isFinite(Number(text))
      )
        invalid(field);
      if (
        Number(text) < (field.validation?.minimum ?? -Infinity) ||
        Number(text) > (field.validation?.maximum ?? Infinity)
      )
        invalid(field);
    }
    if (field.type === "email" && !z.email().safeParse(text).success)
      invalid(field);
    if (field.type === "phone" && !/^[+\d().\s-]{3,80}$/.test(text))
      invalid(field);
    if (hasOptions(field.type) && !field.options.includes(text)) invalid(field);
    if (
      field.type === "rating" &&
      (!/^\d+$/.test(text) ||
        Number(text) < 1 ||
        Number(text) > (field.ratingScale ?? 5))
    )
      invalid(field);
    if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text))
      invalid(field);
    if (field.type === "url") {
      try {
        const url = new URL(text);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          invalid(field);
      } catch {
        invalid(field);
      }
    }
    if (field.type === "date") {
      const date = new Date(`${text}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== text
      )
        invalid(field);
    }
    answers[field.id] = text;
  }
  if (Buffer.byteLength(JSON.stringify(answers), "utf8") > 50000) {
    throw new DomainError(
      "FORM_ANSWERS_TOO_LARGE",
      "Shorten your answers before submitting.",
      413,
    );
  }
  return answers;
}

export function submissionHash(
  versionId: string,
  answers: FormAnswers,
  actorUserId: string | null,
): string {
  const sorted = Object.fromEntries(
    Object.keys(answers)
      .sort()
      .map((key) => [key, answers[key]]),
  );
  return createHash("sha256")
    .update(JSON.stringify({ versionId, answers: sorted, actorUserId }))
    .digest("hex");
}

export function csvCell(value: AnswerValue | number): string {
  const text = Array.isArray(value) ? answerText(value) : String(value);
  // Quoting handles CSV syntax; an apostrophe separately prevents spreadsheet execution.
  const neutralized =
    /^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${neutralized.replaceAll('"', '""')}"`;
}
