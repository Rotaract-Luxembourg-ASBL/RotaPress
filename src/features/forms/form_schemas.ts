import { z } from "zod";
import { matchesRules, ruleGroupSchema } from "./form_logic";
import {
  hasOptions,
  isContentElement,
  MAX_FORM_ELEMENTS,
} from "./form_elements";

export const fieldTypes = [
  "text",
  "email",
  "phone",
  "textarea",
  "choice",
  "checkbox",
  "date",
  "consent",
  "number",
  "radio",
  "multiselect",
  "url",
  "time",
  "rating",
  "heading",
  "page_break",
] as const;
export const formKinds = [
  "contact",
  "membership",
  "event",
  "registration",
] as const;
export const submissionStatuses = ["new", "reviewing", "closed"] as const;
export const formTemplateIds = [
  "contact",
  "membership",
  "volunteer",
  "feedback",
  "rsvp",
  "partnership",
  "blank",
  "event_feedback",
  "speaker",
  "newsletter",
  "waitlist",
  "project_proposal",
] as const;

const cleanText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) =>
        [...value].every((character) => {
          const code = character.charCodeAt(0);
          return (
            (code >= 32 && code !== 127) ||
            character === "\n" ||
            character === "\t"
          );
        }),
      "Remove unsupported control characters.",
    );
export const fieldIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,47}$/)
  .refine(
    (value) => !["constructor", "prototype", "__proto__"].includes(value),
    "Choose another field identifier.",
  );
export const formFieldSchema = z
  .object({
    id: fieldIdSchema,
    type: z.enum(fieldTypes),
    label: cleanText(200).min(1),
    description: cleanText(1500).default(""),
    placeholder: cleanText(160).optional(),
    width: z.enum(["auto", "full", "half"]).optional(),
    ratingScale: z.union([z.literal(5), z.literal(10)]).optional(),
    required: z.boolean().default(false),
    options: z.array(cleanText(160).min(1)).max(30).default([]),
    condition: z
      .object({
        fieldId: fieldIdSchema,
        equals: z.union([cleanText(1000), z.boolean()]),
      })
      .strict()
      .nullable()
      .default(null),
    visibility: ruleGroupSchema.optional(),
    requiredWhen: ruleGroupSchema.optional(),
    validation: z
      .strictObject({
        minLength: z.int().min(0).max(10000).optional(),
        maxLength: z.int().min(1).max(10000).optional(),
        minimum: z.number().finite().optional(),
        maximum: z.number().finite().optional(),
      })
      .optional(),
  })
  .strict();

export const formDefinitionSchema = z
  .object({
    title: cleanText(160).min(1),
    description: cleanText(2500).default(""),
    submitLabel: cleanText(80).min(1).default("Send"),
    successMessage: cleanText(1000)
      .min(1)
      .default("Your response has been received."),
    layout: z.enum(["stacked", "two-column"]).optional(),
    appearance: z
      .strictObject({
        theme: z.enum(["club", "paper", "ocean", "plum"]),
        corners: z.enum(["rounded", "square"]),
        density: z.enum(["comfortable", "compact"]),
      })
      .optional(),
    fields: z.array(formFieldSchema).min(1).max(MAX_FORM_ELEMENTS),
  })
  .strict()
  .superRefine((definition, context) => {
    const previous = new Map<string, FormField>();
    definition.fields.forEach((field, index) => {
      const issue = (message: string) =>
        context.addIssue({ code: "custom", path: ["fields", index], message });
      if (previous.has(field.id)) issue("Field identifiers must be unique.");
      if (
        hasOptions(field.type)
          ? field.options.length === 0
          : field.options.length !== 0
      ) {
        issue(
          "Provide options only for choice fields, with at least one choice.",
        );
      }
      if (new Set(field.options).size !== field.options.length)
        issue("Choice options must be unique.");
      if (
        isContentElement(field.type) &&
        (field.required || field.requiredWhen || field.validation)
      )
        issue("Headings and page breaks do not collect answers.");
      if (
        field.type === "page_break" &&
        (index === 0 ||
          index === definition.fields.length - 1 ||
          definition.fields[index - 1]?.type === "page_break" ||
          field.condition ||
          field.visibility)
      )
        issue(
          "Place each page break between questions. Page breaks cannot have conditions.",
        );
      if (field.ratingScale !== undefined && field.type !== "rating")
        issue("A rating scale belongs to a rating question.");
      if (field.condition) {
        const source = previous.get(field.condition.fieldId);
        if (
          !source ||
          isContentElement(source.type) ||
          source.type === "multiselect"
        )
          issue("A visibility condition must use one earlier field.");
        else if (
          ["checkbox", "consent"].includes(source.type) !==
          (typeof field.condition.equals === "boolean")
        ) {
          issue(
            "The visibility condition must match the earlier field's answer type.",
          );
        } else if (
          hasOptions(source.type) &&
          !source.options.includes(String(field.condition.equals))
        ) {
          issue(
            "The visibility condition must use one of the earlier choices.",
          );
        }
      }
      if (field.condition && field.visibility)
        issue(
          "Use either the original condition or the advanced visibility rules.",
        );
      for (const group of [field.visibility, field.requiredWhen]) {
        for (const rule of group?.rules ?? []) {
          const source = previous.get(rule.fieldId);
          if (!source || isContentElement(source.type)) {
            issue("Rules must refer to an earlier question.");
            continue;
          }
          if (["answered", "not_answered"].includes(rule.operator)) {
            if (rule.value !== undefined)
              issue("Answered rules do not take an expected value.");
            continue;
          }
          if (["greater_than", "less_than"].includes(rule.operator)) {
            if (
              !["number", "rating"].includes(source.type) ||
              typeof rule.value !== "string" ||
              !rule.value.trim() ||
              !Number.isFinite(Number(rule.value))
            )
              issue(
                "Numeric comparisons need a number question and a numeric value.",
              );
            continue;
          }
          if (
            source.type === "multiselect" &&
            !["contains", "not_contains"].includes(rule.operator)
          )
            issue("Use includes or does not include for multiple choices.");
          if (rule.operator === "not_contains" && source.type !== "multiselect")
            issue("Does not include is for multiple choices.");
          const boolean =
            source.type === "checkbox" || source.type === "consent";
          if (
            rule.value === undefined ||
            boolean !== (typeof rule.value === "boolean")
          )
            issue("The rule value must match the source question type.");
          if (
            rule.operator === "contains" &&
            (boolean || !String(rule.value ?? "").trim())
          )
            issue("Contains needs a nonempty text value.");
          if (
            hasOptions(source.type) &&
            (source.type === "multiselect" || rule.operator !== "contains") &&
            !source.options.includes(String(rule.value))
          )
            issue("Choose an existing option for this rule.");
        }
      }
      const limits = field.validation;
      if (limits) {
        if (
          (limits.minimum !== undefined || limits.maximum !== undefined) &&
          field.type !== "number"
        )
          issue("Numeric limits require a number question.");
        if (
          (limits.minLength !== undefined || limits.maxLength !== undefined) &&
          !["text", "textarea", "email", "phone", "url"].includes(field.type)
        )
          issue("Length limits require a text question.");
        if (
          (limits.minimum ?? -Infinity) > (limits.maximum ?? Infinity) ||
          (limits.minLength ?? 0) > (limits.maxLength ?? 10000)
        )
          issue("The minimum must not exceed the maximum.");
      }
      previous.set(field.id, field);
    });
    if (!definition.fields.some((field) => !isContentElement(field.type)))
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Add at least one question to your form.",
      });
    if (
      definition.fields.filter((field) => field.type === "page_break").length >
      9
    )
      context.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Use up to ten pages per form.",
      });
  });

export const formCreateSchema = z
  .object({
    kind: z.enum(["contact", "membership"]),
    title: cleanText(160).min(1).optional(),
    templateId: z.enum(formTemplateIds).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.templateId ||
      (value.templateId === "membership") === (value.kind === "membership"),
    "Choose a template that matches this form's purpose.",
  );
export const formSaveSchema = z
  .object({
    expectedRevision: z.int().positive(),
    definition: formDefinitionSchema,
  })
  .strict();
export const formPublishSchema = z
  .object({ expectedRevision: z.int().positive() })
  .strict();
export const formArchiveSchema = formPublishSchema
  .extend({ archived: z.boolean() })
  .strict();
export const formSettingsSchema = z
  .object({
    recipients: z
      .array(
        z
          .email()
          .max(254)
          .transform((value) => value.toLowerCase()),
      )
      .max(10)
      .refine(
        (values) => new Set(values).size === values.length,
        "Recipients must be unique.",
      ),
    retentionDays: z.int().min(1).max(36500).nullable(),
  })
  .strict();
export const formSubmitSchema = z
  .object({
    versionId: z.uuid(),
    requestId: z.uuid(),
    answers: z
      .record(
        fieldIdSchema,
        z.union([
          z.string().max(10000),
          z.boolean(),
          z.array(cleanText(160).min(1)).max(30),
        ]),
      )
      .refine(
        (answers) => Object.keys(answers).length <= MAX_FORM_ELEMENTS,
        "Too many answers.",
      ),
  })
  .strict();
export const submissionFilterSchema = z
  .object({
    status: z.enum(submissionStatuses).optional(),
    after: z.iso.datetime().optional(),
    before: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (filter) =>
      !filter.after || !filter.before || filter.after <= filter.before,
    "The date range is invalid.",
  );
export const submissionStatusSchema = z
  .object({ status: z.enum(submissionStatuses) })
  .strict();
export const submissionDeleteSchema = z
  .object({ confirm: z.literal(true) })
  .strict();
export const retentionDeleteSchema = z
  .object({
    cutoff: z.iso.datetime(),
    previewToken: z.string().regex(/^[a-f0-9]{64}$/),
    confirm: z.literal(true),
  })
  .strict();

export type FormField = z.infer<typeof formFieldSchema>;
export type FormDefinition = z.infer<typeof formDefinitionSchema>;
export type FormKind = (typeof formKinds)[number];
export type FormSettings = z.infer<typeof formSettingsSchema>;
export type FormAnswers = z.infer<typeof formSubmitSchema>["answers"];
export type SubmissionFilter = z.infer<typeof submissionFilterSchema>;
export type SubmissionStatus = (typeof submissionStatuses)[number];

export function fieldIsVisible(
  field: FormField,
  answers: FormAnswers,
  available?: Set<string>,
): boolean {
  if (field.visibility)
    return matchesRules(field.visibility, answers, available);
  return (
    !field.condition ||
    answers[field.condition.fieldId] === field.condition.equals
  );
}

export function fieldIsRequired(
  field: FormField,
  answers: FormAnswers,
  available?: Set<string>,
): boolean {
  return (
    field.required ||
    Boolean(
      field.requiredWhen &&
      matchesRules(field.requiredWhen, answers, available),
    )
  );
}

export function starterDefinition(
  kind: FormKind,
  title?: string,
): FormDefinition {
  const base = {
    description: "",
    required: true,
    options: [],
    condition: null,
  };
  if (kind === "registration")
    return {
      title: title ?? "Event registration",
      description: "Reserve a free place at this event.",
      submitLabel: "Register",
      successMessage: "Your place is confirmed.",
      fields: [{ ...base, id: "name", type: "text", label: "Your name" }],
    };
  return {
    title:
      title ?? (kind === "membership" ? "Membership application" : "Contact"),
    description:
      kind === "membership"
        ? "Apply to join the club. Applications are reviewed by the club team."
        : "Send a message to the club team.",
    submitLabel: kind === "membership" ? "Submit application" : "Send message",
    successMessage:
      kind === "membership"
        ? "Your application has been received for review."
        : "Your message has been received.",
    fields:
      kind === "membership"
        ? [
            { ...base, id: "name", type: "text", label: "Your name" },
            {
              ...base,
              id: "motivation",
              type: "textarea",
              label: "Why would you like to join?",
            },
          ]
        : [
            { ...base, id: "name", type: "text", label: "Your name" },
            { ...base, id: "email", type: "email", label: "Your email" },
            { ...base, id: "message", type: "textarea", label: "Your message" },
          ],
  };
}
