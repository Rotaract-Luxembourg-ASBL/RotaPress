"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/ui/dialog";
import { errorMessage, request } from "@/ui/api";
import { Notice } from "@/ui/primitives";
import { ActionsMenu } from "@/ui/actions-menu";
import { Icon } from "@/ui/icon";
import { useCurrentUser } from "@/ui/admin-shell";
import { FormDeleteDialog } from "./form-delete-dialog";
import type { FormDto } from "../form_types";

export function formArchiveMessage(form: FormDto) {
  return form.archived
    ? "Form archived. Existing responses are retained."
    : "Form restored as a draft. Publish it when ready.";
}

/** Removal is the existing reversible archive operation, with explicit impact. */
export function FormArchiveAction({
  form,
  disabled = false,
  onChanged,
  onDeleted,
}: {
  form: FormDto;
  disabled?: boolean;
  onChanged: (form: FormDto) => void;
  onDeleted?: () => void;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = form.archived ? "Restore form" : "Archive form";
  const canDelete = form.event
    ? form.event.canReadSubmissions
    : user.capabilities.includes("submissions.manage");
  if (form.event && !form.event.canPublish) return null;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const next = await request<FormDto>(
        `/api/admin/forms/${form.id}/archive`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: form.draftRevision,
            archived: !form.archived,
          }),
        },
      );
      setReviewing(false);
      onChanged(next);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ActionsMenu
        label={`Actions for ${form.draft.title}`}
        disabled={disabled}
      >
        <button
          type="button"
          className="action-item"
          disabled={disabled || copying}
          onClick={async () => {
            setCopying(true);
            setError("");
            try {
              const next = await request<FormDto>(
                `/api/admin/forms/${form.id}/duplicate`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    expectedRevision: form.draftRevision,
                  }),
                },
              );
              router.push(`/admin/forms/${next.id}`);
            } catch (cause) {
              setError(errorMessage(cause));
            } finally {
              setCopying(false);
            }
          }}
        >
          <Icon name="duplicate" />
          {copying ? "Duplicating…" : "Duplicate form"}
        </button>
        <button
          type="button"
          className={
            form.archived ? "action-item" : "action-item action-danger"
          }
          disabled={disabled}
          onClick={() => {
            setError("");
            setReviewing(true);
          }}
        >
          <Icon name={form.archived ? "undo" : "archive"} />
          {label}
        </button>
        {form.archived && canDelete && onDeleted && (
          <button
            type="button"
            className="action-item action-danger"
            disabled={disabled}
            onClick={() => setDeleting(true)}
          >
            <Icon name="trash" />
            Delete permanently
          </button>
        )}
      </ActionsMenu>
      {error && !reviewing && <Notice>{error}</Notice>}
      {deleting && onDeleted && (
        <FormDeleteDialog
          formId={form.id}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onDeleted();
          }}
        />
      )}
      {reviewing && (
        <Dialog
          title={label}
          onClose={() => setReviewing(false)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              <strong>{form.draft.title}</strong>
            </p>
            {form.archived ? (
              <p>
                This returns the form to your active list as an unpublished
                draft. Existing responses are kept. Review the form and publish
                it before accepting new responses.
              </p>
            ) : (
              <>
                <p>
                  This archives the form and stops new responses wherever it
                  appears. The form and existing responses stay stored for
                  authorized staff.
                </p>
                {form.kind === "registration" && (
                  <p>
                    Registration using this form will stop accepting new
                    bookings. Existing bookings are retained.
                  </p>
                )}
                <p>
                  You can find it in Archived and restore it later. This does
                  not permanently delete its records.
                </p>
              </>
            )}
            {error && <Notice>{error}</Notice>}
            <div className="form-actions">
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={() => setReviewing(false)}
              >
                Keep {form.archived ? "archived" : "form"}
              </button>
              <button
                type="button"
                className="button button-accent"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy ? "Saving…" : label}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
