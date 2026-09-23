"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useEditorPuck } from "./editor-blocks";
import { useResource } from "@/ui/api";
import type { FormDto } from "@/features/forms/form_types";

export function FormInsertionPrompt({ disabled }: { disabled: boolean }) {
  const params = useSearchParams();
  const value = params.get("insertForm");
  const id =
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
      ? value
      : null;
  const { data: form, error } = useResource<FormDto>(
    id ? `/api/admin/forms/${id}` : null,
  );
  const dispatch = useEditorPuck((state) => state.dispatch);
  const data = useEditorPuck((state) => state.appState.data);
  const [dismissed, setDismissed] = useState(false);
  if (!id || dismissed) return null;
  return (
    <aside className="form-insertion-prompt" aria-label="Insert selected form">
      <div>
        <strong>
          {form ? `Add ${form.draft.title}` : error || "Loading selected form…"}
        </strong>
        <p>
          Insert at the end of this draft, then arrange and save it. Publication
          is a separate step.
        </p>
      </div>
      <button
        type="button"
        className="button button-accent"
        disabled={disabled || !form || form.archived || Boolean(form.event)}
        onClick={() => {
          dispatch({
            type: "setData",
            data: {
              ...data,
              content: [
                ...data.content,
                {
                  type: "Form",
                  props: {
                    id: `Form-${crypto.randomUUID()}`,
                    version: 1,
                    formId: id,
                  },
                },
              ],
            },
          });
          dispatch({
            type: "setUi",
            ui: {
              itemSelector: {
                index: data.content.length,
                zone: "root:default-zone",
              },
            },
            recordHistory: false,
          });
          setDismissed(true);
        }}
      >
        Insert form block
      </button>
      <button
        type="button"
        className="inline-button"
        onClick={() => setDismissed(true)}
      >
        Dismiss
      </button>
    </aside>
  );
}
