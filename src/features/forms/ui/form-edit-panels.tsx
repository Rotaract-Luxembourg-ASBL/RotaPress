"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormDefinition } from "../form_schemas";
import type { FormDto } from "../form_types";
import { Icon } from "@/ui/icon";
import { Notice } from "@/ui/primitives";
import { PublicFields, type FormAnswers } from "./public-fields";
import { FormPlacement } from "./form-placement";
import {
  appearanceAttributes,
  FormProgress,
  visibleFormPages,
} from "./form-pages";

export function FormDetails({
  draft,
  onChange,
}: {
  draft: FormDefinition;
  onChange: (draft: FormDefinition) => void;
}) {
  return (
    <div className="form-stack">
      <header>
        <h2>Form details</h2>
        <p className="muted">
          Introduce your form and choose what happens after someone sends it.
        </p>
      </header>
      <label>
        Title
        <input
          maxLength={160}
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
      </label>
      <label>
        Introduction
        <textarea
          aria-label="Introduction"
          rows={3}
          maxLength={2500}
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
        <span className="field-help">
          Explain what this form is for and what people can expect.
        </span>
      </label>
      <details className="forms-advanced">
        <summary>Layout and confirmation</summary>
        <div className="form-stack forms-advanced-content">
          <label>
            Field layout
            <select
              value={draft.layout ?? "stacked"}
              onChange={(e) =>
                onChange({
                  ...draft,
                  layout: e.target.value as "stacked" | "two-column",
                })
              }
            >
              <option value="stacked">One column</option>
              <option value="two-column">Two columns on wide screens</option>
            </select>
            <span className="field-help">
              Long answers stay full width. Small screens always use one column.
            </span>
          </label>
          <label>
            Submit button label
            <input
              maxLength={80}
              value={draft.submitLabel}
              onChange={(e) =>
                onChange({ ...draft, submitLabel: e.target.value })
              }
            />
          </label>
          <label>
            Confirmation message
            <textarea
              rows={2}
              maxLength={1000}
              value={draft.successMessage}
              onChange={(e) =>
                onChange({ ...draft, successMessage: e.target.value })
              }
            />
          </label>
        </div>
      </details>
    </div>
  );
}

export function DraftPreview({
  definition,
  embedded = false,
}: {
  definition: FormDefinition;
  embedded?: boolean;
}) {
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [device, setDevice] = useState("desktop");
  const [pageId, setPageId] = useState("first");
  const [complete, setComplete] = useState(false);
  const pages = visibleFormPages(definition, answers);
  const pageIndex = Math.max(
    0,
    pages.findIndex((page) => page.id === pageId),
  );
  return (
    <div className={embedded ? "cms-form-preview" : "form-preview-workspace"}>
      {!embedded && (
        <div className="form-preview-toolbar">
          <p>Try your form. Preview answers are never sent.</p>
          <div className="form-status-filters" aria-label="Preview size">
            <button
              aria-pressed={device === "desktop"}
              onClick={() => setDevice("desktop")}
            >
              <Icon name="desktop" />
              Desktop
            </button>
            <button
              aria-pressed={device === "phone"}
              onClick={() => setDevice("phone")}
            >
              <Icon name="mobile" />
              Phone
            </button>
          </div>
        </div>
      )}
      <section
        className={
          embedded ? "forms-public" : "panel forms-public form-preview-sheet"
        }
        data-device={device}
        {...appearanceAttributes(definition)}
      >
        <h2>{definition.title || "Untitled form"}</h2>
        <p className="forms-public-description">{definition.description}</p>
        {complete ? (
          <Notice kind="success">{definition.successMessage}</Notice>
        ) : (
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (pageIndex < pages.length - 1)
                setPageId(pages[pageIndex + 1].id);
              else setComplete(true);
            }}
          >
            <FormProgress pages={pages} index={pageIndex} />
            <PublicFields
              fields={definition.fields}
              shownIds={pages[pageIndex].fields}
              layout={definition.layout}
              answers={answers}
              onChange={(id, value) => setAnswers({ ...answers, [id]: value })}
            />
            <div className="forms-actions">
              {pageIndex > 0 && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setPageId(pages[pageIndex - 1].id)}
                >
                  Back
                </button>
              )}
              <button
                className="button button-accent form-preview-submit"
                disabled={embedded && pageIndex === pages.length - 1}
              >
                {pageIndex < pages.length - 1
                  ? "Continue"
                  : definition.submitLabel}
              </button>
            </div>
          </form>
        )}
        <p className="field-help">
          {embedded
            ? "Form preview · answers are never sent."
            : `After sending: ${definition.successMessage}`}
        </p>
        <button
          type="button"
          className="text-link forms-reset-preview"
          onClick={() => {
            setAnswers({});
            setPageId("first");
            setComplete(false);
          }}
        >
          Clear preview answers
        </button>
      </section>
    </div>
  );
}

export function FormSharePanel({
  form,
  dirty,
  busy,
  canPlace,
}: {
  form: FormDto;
  dirty: boolean;
  busy: boolean;
  canPlace: boolean;
}) {
  const [message, setMessage] = useState("");
  const path =
    form.kind === "registration" && form.event
      ? `/events/${form.event.id}/en/registration`
      : `/forms/${form.id}`;
  const published = Boolean(form.publishedVersionId && !form.archived);
  return (
    <div className="form-share-layout">
      <section className="panel form-stack">
        <Icon name="external" />
        <h2>Share a link</h2>
        <p className="muted">
          Open your form as its own page, ready to share in a message or email.
        </p>
        {published ? (
          <>
            <label className="form-stack">
              Public form address
              <input aria-label="Public form address" readOnly value={path} />
            </label>
            <div className="forms-actions">
              <Link
                href={path}
                target="_blank"
                className="button button-outline"
              >
                Open public form <Icon name="external" />
              </Link>
              <button
                type="button"
                className="button button-outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      new URL(path, window.location.origin).href,
                    );
                    setMessage("Public link copied.");
                  } catch {
                    setMessage(
                      "Copy the address from the public form in your browser.",
                    );
                  }
                }}
              >
                Copy link
              </button>
            </div>
            {message && <Notice kind="info">{message}</Notice>}
          </>
        ) : (
          <Notice kind="info">
            {form.archived
              ? "Restore this form and publish it before sharing."
              : "Publish your form when it is ready to receive responses."}
          </Notice>
        )}
        {dirty && published && (
          <p className="field-help">
            This link shows the published version. Save and publish your changes
            to update it.
          </p>
        )}
      </section>
      <section className="panel form-stack">
        <Icon name="website" />
        <h2>{form.event ? "Use on your event page" : "Add to your website"}</h2>
        <p className="muted">
          Display your form inside a page alongside your other content.
        </p>
        {form.event ? (
          <Link
            className="button button-outline"
            href={`/admin/events/${form.event.id}?tab=participation`}
          >
            Open event participation
          </Link>
        ) : canPlace ? (
          <FormPlacement
            formId={form.id}
            disabled={busy || dirty || form.archived}
          />
        ) : (
          <p>Your website team can add this form to a page.</p>
        )}
        <p className="field-help">
          {dirty
            ? "Save your draft first, then choose a page."
            : "Publish the form and the page to make it available to visitors."}
        </p>
      </section>
    </div>
  );
}
