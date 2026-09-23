"use client";

import { useState } from "react";
import { Dialog } from "@/ui/dialog";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { FormDeletionReview } from "../form_types";

export function FormDeleteDialog({
  formId,
  onClose,
  onDeleted,
}: {
  formId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { data, error, refresh } = useResource<FormDeletionReview>(
    `/api/admin/forms/${formId}/deletion`,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  async function remove() {
    if (!data || !confirmed || data.blockedReason) return;
    setBusy(true);
    setFailure("");
    try {
      await request(`/api/admin/forms/${formId}`, {
        method: "DELETE",
        body: JSON.stringify({
          expectedRevision: data.revision,
          expectedResponses: data.responses,
          confirmed: true,
        }),
      });
      onDeleted();
    } catch (cause) {
      setFailure(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Permanently delete form"
      onClose={onClose}
      canClose={() => !busy}
    >
      <div className="form-stack">
        {!data && !error && <Loading />}
        {error && <Notice>{error}</Notice>}
        {error && (
          <button
            type="button"
            className="button button-outline"
            onClick={refresh}
          >
            Try again
          </button>
        )}
        {data && (
          <>
            <p>
              <strong>{data.title}</strong>
            </p>
            {data.blockedReason ? (
              <Notice>{data.blockedReason}</Notice>
            ) : (
              <>
                <p>
                  This permanently deletes the form, {data.responses} response
                  {data.responses === 1 ? "" : "s"} and {data.versions}{" "}
                  published version{data.versions === 1 ? "" : "s"}, including
                  their email and webhook delivery records.
                </p>
                <p>
                  Links and website blocks using this form will stay
                  unavailable. Remove them from any pages where they are no
                  longer needed. Messages already delivered cannot be recalled.
                </p>
                <label className="forms-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>I understand this cannot be undone.</span>
                </label>
              </>
            )}
          </>
        )}
        {failure && <Notice>{failure}</Notice>}
        <div className="form-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={onClose}
          >
            Keep archived
          </button>
          {data && !data.blockedReason && (
            <button
              type="button"
              className="button button-danger"
              disabled={!confirmed || busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
