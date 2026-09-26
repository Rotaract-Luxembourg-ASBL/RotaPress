"use client";

import { useTemplateContactForm } from "./template-contact-preview";
import type { CustomField } from "@puckeditor/core";
import { useResource } from "@/ui/api";
import { useCurrentUser } from "@/ui/admin-shell";
import type { FormDto, PublicFormDto } from "@/features/forms/form_types";
import { DraftPreview } from "@/features/forms/ui/form-edit-panels";
import { useEditorEvent, useRefreshOnFocus } from "./event-editor-scope";
import { FormPicker } from "./form-picker";
import { ConnectionError } from "./connected-source";

export const formField: CustomField<string> = {
  type: "custom",
  label: "Form",
  render: ({ value, onChange, readOnly }) => (
    <FormPicker value={value} onChange={onChange} disabled={readOnly} />
  ),
};

function PublishedFormPreview({ formId }: { formId: string }) {
  const { data, error, refresh } = useResource<PublicFormDto>(
    `/api/forms/${formId}`,
  );
  useRefreshOnFocus(refresh);
  if (error)
    return (
      <div className="cms-block cms-image-placeholder">
        Publish this form in Forms to preview it here.
      </div>
    );
  if (!data)
    return <div className="cms-block cms-image-placeholder">Loading form…</div>;
  return (
    <section className="cms-block">
      <DraftPreview
        key={data.versionId}
        definition={data.definition}
        embedded
      />
    </section>
  );
}

function ClubFormPreview({ formId }: { formId: string }) {
  const { data, error, refresh } = useResource<FormDto>(
    `/api/admin/forms/${formId}`,
  );
  useRefreshOnFocus(refresh);
  if (error)
    return (
      <div className="cms-block cms-image-placeholder">
        <ConnectionError error={error} onRetry={refresh} />
      </div>
    );
  if (!data)
    return <div className="cms-block cms-image-placeholder">Loading form…</div>;
  if (data.archived || data.event || data.kind === "registration")
    return (
      <div className="cms-block cms-image-placeholder">
        Choose an active club form in the block settings.
      </div>
    );
  return (
    <section className="cms-block" aria-label="Club form preview">
      <p className="field-help">
        Saved form draft · Publish its questions and design in Forms before
        publishing this page.
      </p>
      <DraftPreview key={data.draftRevision} definition={data.draft} embedded />
    </section>
  );
}

function EventFormPreview({
  formId,
  eventId,
}: {
  formId: string;
  eventId: string;
}) {
  const { data, error, refresh } = useResource<{ forms: FormDto[] }>(
    `/api/admin/events/${eventId}/forms`,
  );
  useRefreshOnFocus(refresh);
  const form = data?.forms.find(
    (item) => item.id === formId && item.kind === "event",
  );
  if (!form)
    return (
      <div className="cms-block cms-image-placeholder">
        {error ??
          (data
            ? "Choose an event form in the Block settings. Create one in Registration & forms if the list is empty."
            : "Loading event forms…")}
      </div>
    );
  return (
    <section className="cms-block" aria-label="Event form preview">
      <DraftPreview key={form.draftRevision} definition={form.draft} embedded />
      <p className="field-help">
        Form draft preview · Publish the form questions separately. Preview
        answers are never sent.
      </p>
    </section>
  );
}

export function FormEditorPreview({
  formId,
  eventId,
}: {
  formId: string;
  eventId?: string;
}) {
  const { features, capabilities } = useCurrentUser();
  const context = useEditorEvent();
  const exampleForm = useTemplateContactForm(formId);
  const id = eventId ?? context?.id;
  if (exampleForm)
    return (
      <section className="cms-block">
        <DraftPreview definition={exampleForm} embedded />
      </section>
    );
  if (!features.forms)
    return (
      <div className="cms-block cms-image-placeholder">
        Forms is disabled in Integrations. This block and its form reference are
        retained.
      </div>
    );
  if (id) return <EventFormPreview formId={formId} eventId={id} />;
  return formId ? (
    capabilities.includes("forms.edit") ? (
      <ClubFormPreview key={formId} formId={formId} />
    ) : (
      <PublishedFormPreview key={formId} formId={formId} />
    )
  ) : (
    <div className="cms-block cms-image-placeholder">
      Choose a reusable form in the Block settings.
    </div>
  );
}
