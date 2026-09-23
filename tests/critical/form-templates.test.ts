import { expect, it } from "vitest";
import { validateAnswers } from "../../src/features/forms/form_answers";
import {
  formCreateSchema,
  formDefinitionSchema,
  formTemplateIds,
  starterDefinition,
} from "../../src/features/forms/form_schemas";
import {
  formTemplates,
  templateDefinition,
} from "../../src/features/forms/form_templates";

it("C05 templates retain form authority, legacy definitions and conditional answer validation", () => {
  for (const templateId of formTemplateIds) {
    const definition = templateDefinition(templateId);
    expect(formDefinitionSchema.parse(definition)).toEqual(definition);
    expect(
      formCreateSchema.safeParse({
        kind: formTemplates[templateId].kind,
        templateId,
      }).success,
    ).toBe(true);
  }
  expect(formCreateSchema.parse({ kind: "membership" })).toEqual({
    kind: "membership",
  });
  for (const input of [
    { kind: "contact", templateId: "membership" },
    { kind: "membership", templateId: "feedback" },
    { kind: "registration", templateId: "rsvp" },
  ]) {
    expect(formCreateSchema.safeParse(input).success).toBe(false);
  }
  const legacy = starterDefinition("contact");
  expect(formDefinitionSchema.parse(legacy)).toEqual(legacy);
  expect(
    formDefinitionSchema.parse({ ...legacy, layout: "two-column" }).layout,
  ).toBe("two-column");

  const feedback = templateDefinition("feedback");
  expect(validateAnswers(feedback, { rating: "Good" })).toEqual({
    rating: "Good",
    follow_up: false,
  });
  expect(() =>
    validateAnswers(feedback, {
      rating: "Good",
      email: "synthetic@example.test",
    }),
  ).toThrow();
  expect(() =>
    validateAnswers(feedback, { rating: "Good", follow_up: true }),
  ).toThrow();
  expect(
    validateAnswers(feedback, {
      rating: "Good",
      follow_up: true,
      email: "synthetic@example.test",
    }),
  ).toMatchObject({ email: "synthetic@example.test" });
});
