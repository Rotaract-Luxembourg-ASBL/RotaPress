import { describe, expect, it } from "vitest";
import {
  formDefinitionSchema,
  formSubmitSchema,
} from "../../src/features/forms/form_schemas";
import { templateDefinition } from "../../src/features/forms/form_templates";
import {
  csvCell,
  submissionHash,
  validateAnswers,
} from "../../src/features/forms/form_answers";

describe("C05 advanced forms preserve the server answer boundary", () => {
  it("validates choices, conditional required answers, layout elements and retry identity", () => {
    const definition = templateDefinition("event_feedback");
    expect(
      validateAnswers(definition, {
        rating: "4",
        highlights: ["Venue", "People"],
      }),
    ).toEqual({
      rating: "4",
      highlights: ["People", "Venue"],
      follow_up: false,
    });
    for (const answers of [
      { rating: "0" },
      { rating: "6" },
      { rating: "3.5" },
      { rating: "4", highlights: ["Unknown"] },
      { rating: "4", highlights: ["People", "People"] },
      { rating: "4", highlights: "People" },
      { rating: "4", email: "synthetic@example.test" },
      { rating: "4", follow_up: true },
      { rating: "4", next: "skip validation" },
      { rating: "4", role: "owner" },
    ])
      expect(() =>
        validateAnswers(
          definition,
          formSubmitSchema.shape.answers.parse(answers),
        ),
      ).toThrow();
    const one = validateAnswers(definition, {
      rating: "4",
      highlights: ["People", "Venue"],
    });
    const two = validateAnswers(definition, {
      rating: "4",
      highlights: ["Venue", "People"],
    });
    expect(submissionHash("version", one, null)).toBe(
      submissionHash("version", two, null),
    );
    expect(csvCell(["=SUM(A1)", "Another choice"])).toBe(
      '"\'=SUM(A1); Another choice"',
    );
    expect(() =>
      validateAnswers(templateDefinition("project_proposal"), {
        name: "Synthetic",
        email: "synthetic@example.test",
        title: "Proposal",
        objectives: "Help people",
        budget: "10",
      }),
    ).toThrow();
  });
  it("uses membership rules for multiple selections and rejects unsafe schemas", () => {
    const definition = templateDefinition("event_feedback");
    definition.fields[3].requiredWhen = {
      mode: "any",
      rules: [{ fieldId: "highlights", operator: "contains", value: "People" }],
    };
    expect(() =>
      validateAnswers(formDefinitionSchema.parse(definition), {
        rating: "4",
        highlights: ["People"],
      }),
    ).toThrow();
    expect(
      validateAnswers(definition, { rating: "4", highlights: ["Venue"] }),
    ).toMatchObject({ highlights: ["Venue"] });
    const invalid = [
      { ...definition, fields: [definition.fields[2], ...definition.fields] },
      { ...definition, fields: [...definition.fields, definition.fields[2]] },
      {
        ...definition,
        fields: definition.fields.map((field) =>
          field.id === "next" ? { ...field, required: true } : field,
        ),
      },
      {
        ...definition,
        fields: definition.fields.map((field) =>
          field.id === "suggestions"
            ? {
                ...field,
                visibility: {
                  mode: "all",
                  rules: [
                    {
                      fieldId: "highlights",
                      operator: "equals",
                      value: "People",
                    },
                  ],
                },
              }
            : field,
        ),
      },
      {
        ...definition,
        appearance: {
          theme: "javascript:alert(1)",
          corners: "square",
          density: "compact",
        },
      },
    ];
    for (const value of invalid)
      expect(formDefinitionSchema.safeParse(value).success).toBe(false);
  });
  it("validates URL and time answers and retains legacy definitions", () => {
    const definition = templateDefinition("contact");
    definition.fields = [
      {
        id: "website",
        type: "url",
        label: "Website",
        description: "",
        required: true,
        options: [],
        condition: null,
      },
      {
        id: "time",
        type: "time",
        label: "Time",
        description: "",
        required: true,
        options: [],
        condition: null,
      },
    ];
    expect(
      validateAnswers(definition, {
        website: "https://example.test/about",
        time: "23:59",
      }),
    ).toEqual({ website: "https://example.test/about", time: "23:59" });
    for (const website of [
      "javascript:alert(1)",
      "data:text/plain,test",
      "https://user:password@example.test",
    ])
      expect(() =>
        validateAnswers(definition, { website, time: "12:30" }),
      ).toThrow();
    for (const time of ["24:00", "12:60", "1:00"])
      expect(() =>
        validateAnswers(definition, { website: "https://example.test", time }),
      ).toThrow();
    const legacy = templateDefinition("contact");
    expect(formDefinitionSchema.parse(legacy)).toEqual(legacy);
  });
});
