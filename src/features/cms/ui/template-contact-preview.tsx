"use client";

import { createContext, useContext, type ReactNode } from "react";
import { templateDefinition } from "@/features/forms/form_templates";

const TemplateContact = createContext<string | undefined>(undefined);

/** Only the authorized, zero-write template preview supplies this in-memory ID. */
export function TemplateContactPreview({
  formId,
  children,
}: {
  formId?: string;
  children: ReactNode;
}) {
  return (
    <TemplateContact.Provider value={formId}>
      {children}
    </TemplateContact.Provider>
  );
}

export function useTemplateContactForm(formId: string) {
  const exampleId = useContext(TemplateContact);
  return exampleId && exampleId === formId
    ? templateDefinition("contact", "Contact the club")
    : undefined;
}
