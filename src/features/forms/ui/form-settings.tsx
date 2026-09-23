"use client";

import { useState, type FormEvent } from "react";
import { formSettingsSchema } from "../form_schemas";
import type { FormSettingsDto, RetentionPreview } from "../form_types";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import { WebhookSettingsPanel } from "./webhook-settings";

function RetentionActions({
  formId,
  retentionDays,
}: {
  formId: string;
  retentionDays: number | null;
}) {
  const [preview, setPreview] = useState<RetentionPreview>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function review() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    setConfirmed(false);
    try {
      setPreview(
        await request<RetentionPreview>(`/api/admin/forms/${formId}/retention`),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!preview || !confirmed) return;
    setBusy(true);
    setError(undefined);
    try {
      await request(`/api/admin/forms/${formId}/retention`, {
        method: "POST",
        body: JSON.stringify({
          cutoff: preview.cutoff,
          previewToken: preview.previewToken,
          confirm: true,
        }),
      });
      setMessage("The submissions in this retention preview were deleted.");
      setPreview(undefined);
      setConfirmed(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-stack">
      <p className="field-help">
        Retention deletion is deliberate. Review the matching submissions before
        confirming permanent deletion. Each preview selects at most 1,000
        submissions; review another batch if needed.
      </p>
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <button
        type="button"
        className="button button-outline"
        disabled={busy || retentionDays === null}
        onClick={review}
      >
        Preview retention deletion
      </button>
      {preview && (
        <div className="forms-retention-preview form-stack">
          <strong>{preview.count} submissions match</strong>
          <p>
            Received before {new Date(preview.cutoff).toLocaleString()}, using
            the saved {preview.retentionDays}-day retention period.
          </p>
          {preview.count > 0 && (
            <>
              <label className="forms-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  Permanently delete these submissions and their notification
                  records.
                </span>
              </label>
              <button
                type="button"
                className="button button-outline"
                disabled={!confirmed || busy}
                onClick={remove}
              >
                {busy ? "Deleting…" : `Delete ${preview.count} submissions`}
              </button>
            </>
          )}
          <button
            type="button"
            className="inline-button"
            disabled={busy}
            onClick={() => {
              setPreview(undefined);
              setConfirmed(false);
            }}
          >
            Close preview
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsForm({
  initial,
  formId,
  archived,
  registration = false,
  canReview,
}: {
  initial: FormSettingsDto;
  formId: string;
  archived: boolean;
  registration?: boolean;
  canReview?: boolean;
}) {
  const user = useCurrentUser();
  const [saved, setSaved] = useState(initial);
  const [recipients, setRecipients] = useState(initial.recipients.join("\n"));
  const [retention, setRetention] = useState(
    initial.retentionDays?.toString() ?? "",
  );
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    const result = formSettingsSchema.safeParse({
      recipients: recipients
        .split(/\n|,/)
        .map((value) => value.trim())
        .filter(Boolean),
      retentionDays: retention.trim() ? Number(retention) : null,
    });
    if (!result.success) {
      setError(result.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      const next = await request<FormSettingsDto>(
        `/api/admin/forms/${formId}/settings`,
        { method: "POST", body: JSON.stringify(result.data) },
      );
      setSaved(next);
      setRecipients(next.recipients.join("\n"));
      setRetention(next.retentionDays?.toString() ?? "");
      setMessage("Notification and retention settings saved.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel forms-settings">
      <div>
        <h2>Notifications & retention</h2>
        <p className="muted">These settings are private to the club team.</p>
      </div>
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <form onSubmit={save}>
        <fieldset
          className="form-stack forms-fieldset"
          disabled={busy || archived}
        >
          <label>
            Notification recipients
            <textarea
              rows={3}
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              placeholder="team@example.org"
            />
            <span className="field-help">
              One email per line, up to 10. Leave empty to receive no email
              notifications. Submissions are still saved.
            </span>
          </label>
          <label>
            Keep submissions for this many days
            <input
              disabled={registration}
              type="number"
              min={1}
              max={36500}
              step={1}
              value={retention}
              onChange={(event) => setRetention(event.target.value)}
              placeholder="No retention limit"
            />
            <span className="field-help">
              {registration
                ? "Registration responses are retained with booking history. Cancel a registration to release its place."
                : "Leave empty to keep submissions until manually deleted. Setting a period does not automatically delete records."}
            </span>
          </label>
          <button className="button button-outline">
            {busy ? "Saving…" : "Save settings"}
          </button>
        </fieldset>
      </form>
      {!registration &&
        (canReview ?? user.capabilities.includes("submissions.manage")) && (
          <RetentionActions
            key={saved.retentionDays ?? "unlimited"}
            formId={formId}
            retentionDays={saved.retentionDays}
          />
        )}
    </section>
  );
}

export function FormSettingsPanel({
  formId,
  archived,
  registration = false,
  canReview,
}: {
  formId: string;
  archived: boolean;
  registration?: boolean;
  canReview?: boolean;
}) {
  const { data, error } = useResource<FormSettingsDto>(
    `/api/admin/forms/${formId}/settings`,
  );
  return error ? (
    <Notice>{error}</Notice>
  ) : data ? (
    <>
      <SettingsForm
        initial={data}
        formId={formId}
        archived={archived}
        registration={registration}
        canReview={canReview}
      />
      <WebhookSettingsPanel formId={formId} archived={archived} />
    </>
  ) : (
    <Loading />
  );
}
