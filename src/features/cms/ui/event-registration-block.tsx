"use client";

import Link from "next/link";
import { useResource } from "@/ui/api";
import type { FormDto } from "@/features/forms/form_types";
import type { RegistrationSettingsDto } from "@/features/events/registration_schemas";
import { PublicFields } from "@/features/forms/ui/public-fields";
import { useEditorEvent, useRefreshOnFocus } from "./event-editor-scope";

/** The block is bound to its page's trusted event, never an editable event ID. */
export function EventRegistrationPreview({ eventId }: { eventId?: string }) {
  const context = useEditorEvent();
  const id = eventId ?? context?.id;
  const settings = useResource<
    Pick<RegistrationSettingsDto, "authority" | "formId" | "open">
  >(id ? `/api/admin/events/${id}/registration-preview` : null);
  const forms = useResource<{ forms: FormDto[] }>(
    id ? `/api/admin/events/${id}/forms` : null,
  );
  useRefreshOnFocus(settings.refresh);
  useRefreshOnFocus(forms.refresh);
  const selected = forms.data?.forms.find(
    (form) => form.id === settings.data?.formId,
  );
  return (
    <section
      className="cms-block forms-public"
      aria-label="Event registration preview"
    >
      <h2>{selected?.draft.title ?? "Event registration"}</h2>
      {selected ? (
        <>
          <p>{selected.draft.description}</p>
          <PublicFields
            fields={selected.draft.fields}
            layout={selected.draft.layout}
            answers={{}}
            disabled
            onChange={() => {}}
          />
          <button className="button button-accent" disabled>
            {selected.draft.submitLabel}
          </button>
          <p className="field-help">
            Form draft preview ·{" "}
            {settings.data?.open
              ? "Saved registration setting: open"
              : "Saved registration setting: closed"}
            . Visitors see published questions and sign in to register. Preview
            submissions are disabled.
          </p>
        </>
      ) : (
        <p>
          {settings.data?.authority === "luma"
            ? "The published Luma registration link appears here when available."
            : "Create and publish a registration form, then choose it in Registration & forms. The form will appear here."}
        </p>
      )}
      {settings.error && <p className="field-help">{settings.error}</p>}
      {id && (
        <Link
          className="text-link"
          href={`/admin/events/${id}?tab=participation`}
          target="_blank"
        >
          Set up registration ↗
        </Link>
      )}
    </section>
  );
}
