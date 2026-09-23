"use client";
import { useEffect, useRef } from "react";
import type { FormDefinition } from "../form_schemas";
import { visibleFields, type FormAnswers } from "./public-fields";

export function visibleFormPages(
  definition: FormDefinition,
  answers: FormAnswers,
) {
  const visible = new Set(
    visibleFields(definition.fields, answers).map((field) => field.id),
  );
  const pages = [
    {
      id: "first",
      title: "Getting started",
      description: "",
      fields: [] as string[],
    },
  ];
  for (const field of definition.fields) {
    if (field.type === "page_break")
      pages.push({
        id: field.id,
        title: field.label,
        description: field.description,
        fields: [],
      });
    else if (visible.has(field.id))
      pages[pages.length - 1].fields.push(field.id);
  }
  const populated = pages.filter((page) => page.fields.length > 0);
  return populated.length ? populated : [pages[0]];
}

export function FormProgress({
  pages,
  index,
}: {
  pages: ReturnType<typeof visibleFormPages>;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(index);
  useEffect(() => {
    if (previous.current !== index) ref.current?.focus();
    previous.current = index;
  }, [index]);
  if (pages.length < 2) return null;
  return (
    <div
      className="forms-progress"
      ref={ref}
      tabIndex={-1}
      aria-label="Form progress"
      aria-live="polite"
    >
      <div>
        <span>
          Step {index + 1} of {pages.length}
        </span>
        <strong>{pages[index].title}</strong>
      </div>
      <progress
        max={pages.length}
        value={index + 1}
        aria-label="Form progress"
      />
      {pages[index].description && <p>{pages[index].description}</p>}
    </div>
  );
}

export function appearanceAttributes(definition: FormDefinition) {
  return {
    "data-form-theme": definition.appearance?.theme ?? "club",
    "data-form-corners": definition.appearance?.corners ?? "rounded",
    "data-form-density": definition.appearance?.density ?? "comfortable",
  };
}
