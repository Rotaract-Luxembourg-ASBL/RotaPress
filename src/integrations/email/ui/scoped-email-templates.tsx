"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { request, useResource, errorMessage } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { EmailTemplateEditor } from "./email-template-editor";
import { emailTemplateCatalogue } from "../email_templates";
import type {
  EmailTemplateKey,
  EmailTemplateTarget,
  ScopedEmailWorkspace,
} from "../email_schemas";
import "./email.css";

export function ScopedEmailTemplates({
  target,
  onDirtyChange,
}: {
  target: EmailTemplateTarget;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const endpoint = "/api/admin/email-templates";
  const resource = useResource<ScopedEmailWorkspace>(
    `${endpoint}?kind=${target.kind}&id=${target.id}`,
  );
  const [saved, setSaved] = useState<ScopedEmailWorkspace>();
  const [selected, setSelected] = useState<EmailTemplateKey>(
    target.kind === "calendar" ? "calendar_update" : "form_submission",
  );
  const [customizing, setCustomizing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  const inFlight = useRef(false);
  const dirtyChanged = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange?.(value);
    },
    [onDirtyChange],
  );
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const data = saved ?? resource.data;
  async function change(operation: string, values: unknown) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setReceipt(undefined);
    try {
      setSaved(
        await request<ScopedEmailWorkspace>(endpoint, {
          method: "POST",
          body: JSON.stringify({
            ...(values as Record<string, unknown>),
            target,
            operation,
          }),
        }),
      );
      setReceipt(
        operation === "save"
          ? "Email draft saved for this " + target.kind + "."
          : operation === "publish"
            ? "Custom email published for this " + target.kind + "."
            : "This " +
              target.kind +
              " now uses the shared template. Your custom draft is retained.",
      );
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return resource.error ? (
      <>
        <Notice>{resource.error}</Notice>
        <button className="button button-outline" onClick={resource.refresh}>
          Try again
        </button>
      </>
    ) : (
      <Loading />
    );
  const row = data.templates.find((t) => t.key === selected)!;
  return (
    <section
      className="email-workspace email-scoped"
      aria-label={`Email templates for ${data.name}`}
    >
      <div className="email-section-heading">
        <div>
          <h2>Emails for {data.name}</h2>
          <p>
            Customize messages for this {target.kind}. Delivery connections stay
            in Integrations → Email.
          </p>
        </div>
      </div>
      {data.templates.length > 1 && (
        <label className="email-template-picker">
          Email to customize
          <select
            value={selected}
            disabled={busy}
            onChange={(e) => {
              if (!dirty || window.confirm("Discard unsaved email changes?")) {
                setSelected(e.target.value as EmailTemplateKey);
                setCustomizing(false);
              }
            }}
          >
            {data.templates.map((t) => (
              <option key={t.key} value={t.key}>
                {emailTemplateCatalogue[t.key].name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="email-scope-state">
        <div>
          <strong>
            {row.published
              ? "Sending: custom template"
              : "Sending: shared template"}
          </strong>
          <p>
            {row.published
              ? "Shared template edits do not change this published customization."
              : "Updates to the shared template automatically apply here until you publish a customization."}
          </p>
        </div>
        {row.published && (
          <button
            className="button button-outline"
            disabled={busy || data.readOnly}
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Discard unsaved changes and use the shared template?",
                )
              )
                void change("useDefault", {
                  key: row.key,
                  expectedVersion: row.version,
                });
            }}
          >
            Use shared template
          </button>
        )}
      </div>
      {data.readOnly && (
        <Notice kind="info">
          Restore this {target.kind} to change its email templates.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {receipt && <Notice kind="success">{receipt}</Notice>}
      {customizing || row.version > 0 ? (
        <EmailTemplateEditor
          key={`${row.key}:${row.version}`}
          row={row}
          clubName={data.clubName}
          busy={busy || data.readOnly}
          fallback={row.fallback}
          scoped
          dirtyChanged={dirtyChanged}
          act={(operation, values) =>
            change(operation === "saveTemplate" ? "save" : "publish", values)
          }
        />
      ) : (
        <div className="panel email-customize-start">
          <h3>{emailTemplateCatalogue[row.key].name}</h3>
          <p>{emailTemplateCatalogue[row.key].purpose}</p>
          <p>
            <strong>Current subject:</strong>{" "}
            {row.fallback.subject.replaceAll("{{club_name}}", data.clubName)}
          </p>
          <button
            className="button button-accent"
            disabled={data.readOnly}
            onClick={() => setCustomizing(true)}
          >
            Customize for this {target.kind}
          </button>
        </div>
      )}
    </section>
  );
}
