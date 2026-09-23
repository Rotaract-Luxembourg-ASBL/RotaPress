import { z } from "zod";
import type { AnswerValue } from "./form_elements";

export const ruleSchema = z.strictObject({
  fieldId: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "answered",
    "not_answered",
    "not_contains",
    "greater_than",
    "less_than",
  ]),
  value: z.union([z.string().trim().max(1000), z.boolean()]).optional(),
});
export const ruleGroupSchema = z.strictObject({
  mode: z.enum(["all", "any"]),
  rules: z.array(ruleSchema).min(1).max(6),
});
export type RuleGroup = z.infer<typeof ruleGroupSchema>;
export type Rule = z.infer<typeof ruleSchema>;

export function ruleSources(field: {
  condition?: { fieldId: string } | null;
  visibility?: RuleGroup;
  requiredWhen?: RuleGroup;
}): string[] {
  return [
    ...(field.condition ? [field.condition.fieldId] : []),
    ...(field.visibility?.rules ?? []).map((rule) => rule.fieldId),
    ...(field.requiredWhen?.rules ?? []).map((rule) => rule.fieldId),
  ];
}

export function matchesRules(
  group: RuleGroup,
  answers: Record<string, AnswerValue>,
  available?: Set<string>,
): boolean {
  const matches = group.rules.map((rule) => {
    // An unavailable (hidden) source can never activate another question.
    if (available && !available.has(rule.fieldId)) return false;
    const value = answers[rule.fieldId];
    const answered =
      value !== undefined &&
      value !== "" &&
      (!Array.isArray(value) || value.length > 0);
    if (rule.operator === "answered") return answered;
    if (rule.operator === "not_answered") return !answered;
    if (!answered) return false;
    if (Array.isArray(value)) {
      if (typeof rule.value !== "string") return false;
      if (rule.operator === "contains") return value.includes(rule.value);
      if (rule.operator === "not_contains") return !value.includes(rule.value);
      return false;
    }
    if (rule.operator === "greater_than" || rule.operator === "less_than") {
      if (
        typeof value !== "string" ||
        typeof rule.value !== "string" ||
        !Number.isFinite(Number(value)) ||
        !Number.isFinite(Number(rule.value))
      )
        return false;
      return rule.operator === "greater_than"
        ? Number(value) > Number(rule.value)
        : Number(value) < Number(rule.value);
    }
    if (rule.operator === "contains")
      return (
        typeof value === "string" &&
        typeof rule.value === "string" &&
        value.toLocaleLowerCase().includes(rule.value.toLocaleLowerCase())
      );
    return rule.operator === "equals"
      ? value === rule.value
      : value !== rule.value;
  });
  return group.mode === "all" ? matches.every(Boolean) : matches.some(Boolean);
}
