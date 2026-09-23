"use client";
import { useEffect, useState } from "react";
import { Notice } from "@/ui/primitives";
import { emailTemplateCatalogue, renderEmail } from "../email_templates";
import {
  emailTemplateSchema,
  type EmailTemplateView,
  type EmailTemplate,
} from "../email_schemas";

export function EmailTemplateEditor({
  row,
  clubName,
  busy,
  act,
  dirtyChanged,
  fallback = emailTemplateCatalogue[row.key].defaults,
  scoped = false,
}: {
  row: EmailTemplateView;
  clubName: string;
  busy: boolean;
  act: (
    operation: "saveTemplate" | "publishTemplate",
    values: unknown,
  ) => Promise<boolean>;
  dirtyChanged: (dirty: boolean) => void;
  fallback?: EmailTemplate;
  scoped?: boolean;
}) {
  const [draft, setDraft] = useState(row.draft);
  const [preview, setPreview] = useState<"html" | "text">("html");
  const dirty = JSON.stringify(draft) !== JSON.stringify(row.draft);
  const savedChanges =
    JSON.stringify(row.draft) !== JSON.stringify(row.published ?? fallback);
  useEffect(() => {
    dirtyChanged(dirty);
    return () => dirtyChanged(false);
  }, [dirty, dirtyChanged]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const result = emailTemplateSchema.safeParse(draft);
  const rendered = result.success
    ? renderEmail(row.key, result.data, {
        clubName,
        code: "123456",
        actionUrl: "https://preview.invalid/calendar",
        unsubscribeUrl: "https://preview.invalid/email/unsubscribe",
      })
    : null;
  const change = <K extends keyof EmailTemplate>(
    key: K,
    value: EmailTemplate[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <>
      <div className="email-editor-heading">
        <div>
          <h2>{emailTemplateCatalogue[row.key].name}</h2>
          <p>{emailTemplateCatalogue[row.key].purpose}</p>
        </div>
        <span className="status-badge">
          {dirty
            ? "Unsaved changes"
            : savedChanges
              ? "Saved draft"
              : row.published
                ? "Published"
                : "Using default"}
        </span>
      </div>
      <div className="email-editor-grid">
        <section className="panel email-copy" aria-label="Email content">
          <fieldset disabled={busy}>
            <label>
              Subject
              <input
                value={draft.subject}
                maxLength={160}
                onChange={(e) => change("subject", e.target.value)}
              />
            </label>
            <label>
              Heading
              <input
                value={draft.heading}
                maxLength={160}
                onChange={(e) => change("heading", e.target.value)}
              />
            </label>
            <label>
              Message
              <textarea
                value={draft.body}
                rows={7}
                maxLength={3000}
                onChange={(e) => change("body", e.target.value)}
              />
            </label>
            <p className="muted">
              Use <code>{"{{club_name}}"}</code> for your community name. Write
              plain text; spacing and paragraphs appear in the preview.
            </p>
            {row.key !== "verification" && (
              <label>
                Button text
                <input
                  value={draft.buttonLabel}
                  maxLength={60}
                  onChange={(e) => change("buttonLabel", e.target.value)}
                />
              </label>
            )}
            <label>
              Accent color
              <input
                type="color"
                value={draft.accent}
                onChange={(e) => change("accent", e.target.value)}
              />
            </label>
          </fieldset>
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => setDraft(fallback)}
          >
            {scoped
              ? "Copy shared template into draft"
              : "Restore default in draft"}
          </button>
        </section>
        <section className="email-preview" aria-label="Email preview">
          <div className="email-actions">
            <h3>Live preview</h3>
            <button
              className="button button-small button-outline"
              aria-pressed={preview === "html"}
              onClick={() => setPreview("html")}
            >
              Email design
            </button>
            <button
              className="button button-small button-outline"
              aria-pressed={preview === "text"}
              onClick={() => setPreview("text")}
            >
              Plain text
            </button>
          </div>
          <p className="muted">
            Sample content. Preview links do not send messages or change
            preferences.
          </p>
          {rendered ? (
            <>
              <p className="email-subject">
                <strong>Subject:</strong> {rendered.subject}
              </p>
              {preview === "html" ? (
                <iframe
                  title="Email design preview"
                  sandbox=""
                  srcDoc={rendered.html}
                />
              ) : (
                <pre>{rendered.text}</pre>
              )}
            </>
          ) : (
            <Notice>
              {result.error?.issues.map((i) => i.message).join(" ")}
            </Notice>
          )}
        </section>
      </div>
      <div className="email-savebar">
        <span>
          {dirty
            ? "Save your changes, then publish to use them in future emails."
            : savedChanges
              ? "Your draft is saved. Publish when it is ready to send."
              : "Future emails use the published template or the default above."}
        </span>
        <div className="email-actions">
          <button
            className="button button-outline"
            disabled={
              busy ||
              (!dirty && !(scoped && row.version === 0)) ||
              !result.success
            }
            onClick={() =>
              void act("saveTemplate", {
                key: row.key,
                expectedVersion: row.version,
                draft,
              })
            }
          >
            Save draft
          </button>
          <button
            className="button button-accent"
            disabled={
              busy ||
              dirty ||
              (!savedChanges && !(scoped && row.version > 0 && !row.published))
            }
            onClick={() =>
              void act("publishTemplate", {
                key: row.key,
                expectedVersion: row.version,
              })
            }
          >
            Publish template
          </button>
        </div>
      </div>
    </>
  );
}
