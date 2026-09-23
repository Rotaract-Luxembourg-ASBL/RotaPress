"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formTemplateIds } from "../form_schemas";
import {
  formTemplates,
  templateDefinition,
  type FormTemplateId,
} from "../form_templates";
import type { FormDto } from "../form_types";
import { errorMessage, request } from "@/ui/api";
import { Notice } from "@/ui/primitives";
import { Dialog } from "@/ui/dialog";
import { Icon } from "@/ui/icon";
import { isContentElement } from "../form_elements";
import { DraftPreview } from "./form-edit-panels";

export function FormCreatePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<FormTemplateId>("contact");
  const [stage, setStage] = useState<"template" | "details">("template");
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const template = formTemplates[templateId];
  const definition = templateDefinition(templateId);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const form = await request<FormDto>("/api/admin/forms", {
        method: "POST",
        body: JSON.stringify({
          kind: template.kind,
          templateId,
          ...(title.trim() ? { title: title.trim() } : {}),
        }),
      });
      router.push(`/admin/forms/${form.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Create a form" onClose={onClose} canClose={() => !busy}>
      <div className="form-create-flow">
        <ol className="form-create-progress" aria-label="Creation progress">
          <li aria-current={stage === "template" ? "step" : undefined}>
            1. Choose a template
          </li>
          <li aria-current={stage === "details" ? "step" : undefined}>
            2. Make it yours
          </li>
        </ol>
        {stage === "template" ? (
          <>
            <p className="muted">
              What would you like to collect? Every template can be edited.
            </p>
            <input
              type="search"
              aria-label="Search form templates"
              placeholder="Find a starting point…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div
              className="form-template-grid"
              role="group"
              aria-label="Form templates"
            >
              {formTemplateIds
                .filter((id) =>
                  `${formTemplates[id].title} ${formTemplates[id].description}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((id) => (
                  <button
                    type="button"
                    className="form-template-card"
                    key={id}
                    aria-pressed={id === templateId}
                    onClick={() => setTemplateId(id)}
                  >
                    <span className="form-template-top">
                      <Icon
                        name={
                          id === "membership" || id === "volunteer"
                            ? "members"
                            : id === "blank"
                              ? "plus"
                              : "forms"
                        }
                      />
                      {id === templateId && <Icon name="check" />}
                    </span>
                    <strong>{formTemplates[id].title}</strong>
                    <span>{formTemplates[id].description}</span>
                    <small>
                      {
                        templateDefinition(id).fields.filter(
                          (field) => !isContentElement(field.type),
                        ).length
                      }{" "}
                      questions
                    </small>
                  </button>
                ))}
            </div>
            <details className="forms-advanced">
              <summary>Try the {template.title} template</summary>
              <DraftPreview key={templateId} definition={definition} />
            </details>
            <div className="form-create-footer">
              <button
                type="button"
                className="button button-outline"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-accent"
                onClick={() => setStage("details")}
              >
                Continue with {template.title}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={create} className="form-stack">
            <label>
              Form title
              <input
                aria-label="Form title"
                autoFocus
                value={title}
                maxLength={160}
                placeholder={template.title}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
              />
              <span className="field-help">
                Visitors will see this title. You can change it later.
              </span>
            </label>
            <div className="forms-template-description">
              <strong>{template.title} template</strong>
              <p>{template.description}</p>
              <span className="field-help">
                {
                  definition.fields.filter(
                    (field) => !isContentElement(field.type),
                  ).length
                }{" "}
                questions ·{" "}
                {1 +
                  definition.fields.filter(
                    (field) => field.type === "page_break",
                  ).length}{" "}
                {definition.fields.some((field) => field.type === "page_break")
                  ? "pages"
                  : "page"}
                {definition.fields.some(
                  (field) => field.condition || field.visibility,
                )
                  ? " · Includes conditional questions"
                  : ""}
              </span>
              <ol>
                {definition.fields.map((field) => (
                  <li key={field.id}>{field.label}</li>
                ))}
              </ol>
            </div>
            {template.kind === "membership" && (
              <Notice kind="info">
                Applicants verify their email before submitting. Your team
                reviews and approves membership.
              </Notice>
            )}
            <p className="field-help">
              Your form starts as a private draft. Next, edit the questions and
              try it before publishing.
            </p>
            {error && <Notice>{error}</Notice>}
            <div className="form-create-footer">
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={() => setStage("template")}
              >
                <Icon name="back" />
                Back
              </button>
              <button className="button button-accent" disabled={busy}>
                {busy ? "Creating…" : "Create draft"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
