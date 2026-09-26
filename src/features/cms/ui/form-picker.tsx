"use client";

import { useCallback, useState } from "react";
import { useResource, request, errorMessage } from "@/ui/api";
import { useCurrentUser } from "@/ui/admin-shell";
import type { FormDto } from "@/features/forms/form_types";
import { useEditorEvent, useRefreshOnFocus } from "./event-editor-scope";
import { ConnectedSource, ConnectionError } from "./connected-source";

export function FormPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const { features, capabilities } = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<FormDto>();
  const [createError, setCreateError] = useState("");
  const event = useEditorEvent();
  const canBrowse = Boolean(event) || capabilities.includes("forms.edit");
  const { data, error, refresh } = useResource<{ forms: FormDto[] }>(
    features.forms && canBrowse
      ? event
        ? `/api/admin/events/${event.id}/forms`
        : "/api/admin/forms"
      : null,
  );
  const refreshForms = useCallback(() => {
    setCreated(undefined);
    refresh();
  }, [refresh]);
  useRefreshOnFocus(refreshForms);
  const forms = [
    ...(data?.forms ?? []),
    ...(created && !data?.forms.some((form) => form.id === created.id)
      ? [created]
      : []),
  ].filter(
    (form) =>
      !form.archived &&
      (event
        ? form.kind === "event"
        : !form.event && form.kind !== "registration"),
  );
  const selected = forms.find((form) => form.id === value);
  const canEdit = event
    ? selected?.event?.canEdit
    : capabilities.includes("forms.edit");
  const status = !canBrowse
    ? "Form access required"
    : error
      ? "Connection unavailable"
      : !data
        ? "Loading forms…"
        : selected
          ? selected.publishedVersionId
            ? "Published version available"
            : "Draft only"
          : value
            ? "Unavailable selection"
            : "No form selected";
  return (
    <div className="editor-connection-picker">
      {features.forms && (
        <label>
          {event ? "Event form" : "Reusable form"}
          <select
            value={value}
            disabled={disabled || !canBrowse || (!data && !created)}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Choose a form</option>
            {value && !selected && (
              <option value={value}>
                {!canBrowse || error
                  ? "Saved form — selection retained"
                  : data
                    ? "Unavailable form — selection retained"
                    : "Loading selected form…"}
              </option>
            )}
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.draft.title}
                {form.publishedVersionId ? "" : " — draft"}
              </option>
            ))}
          </select>
        </label>
      )}
      <ConnectedSource
        name={event ? "Event forms" : "Forms"}
        icon="forms"
        enabled={features.forms}
        status={status}
        tone={
          error
            ? "attention"
            : selected?.publishedVersionId
              ? "ready"
              : value
                ? "attention"
                : "neutral"
        }
        description={
          selected?.publishedVersionId
            ? "Visitors see the published form. This editor previews its saved draft; publish question changes in Forms when ready. Responses stay private."
            : "Questions and design are managed in Forms. Publish the form before publishing this page. Responses stay private."
        }
        href={
          selected && canEdit
            ? `/admin/forms/${selected.id}`
            : event
              ? `/admin/events/${event.id}?tab=participation`
              : canEdit
                ? "/admin/forms"
                : undefined
        }
        action={
          selected && canEdit
            ? "Edit questions & design"
            : event
              ? "Open Registration & forms"
              : "Open Forms"
        }
        onRefresh={canBrowse ? refreshForms : undefined}
      />
      {features.forms && (
        <>
          {error && <ConnectionError error={error} onRetry={refreshForms} />}
          {!canBrowse && (
            <p className="field-help">
              Ask a Forms editor to review or change this form connection. The
              saved selection is kept.
            </p>
          )}
          {data && !forms.length && !error && (
            <p className="field-help">
              {event
                ? "No active enquiry forms for this event. Create one in its Registration & forms workspace."
                : "No reusable forms yet. Create a contact form here or choose a template in Forms."}
            </p>
          )}
          {value && data && !selected && !error && (
            <p className="field-help">
              The selected form is archived or unavailable here. Its selection
              is kept; choose another form to replace it.
            </p>
          )}
          {createError && <p role="alert">{createError}</p>}
          {!event && capabilities.includes("forms.edit") && (
            <button
              type="button"
              className="button button-outline"
              disabled={disabled || creating}
              onClick={async () => {
                setCreating(true);
                setCreateError("");
                try {
                  const form = await request<FormDto>("/api/admin/forms", {
                    method: "POST",
                    body: JSON.stringify({
                      kind: "contact",
                      templateId: "contact",
                      title: "Contact the club",
                    }),
                  });
                  setCreated(form);
                  refresh();
                  onChange(form.id);
                } catch (cause) {
                  setCreateError(errorMessage(cause));
                } finally {
                  setCreating(false);
                }
              }}
            >
              {creating ? "Creating…" : "Create contact form"}
            </button>
          )}
          {event && (
            <p className="field-help">
              This is an enquiry form. For bookings, add the Event registration
              block.
            </p>
          )}
        </>
      )}
    </div>
  );
}
