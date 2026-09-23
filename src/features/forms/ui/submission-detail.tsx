"use client";
import { answerText } from "../form_elements";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormDto, SubmissionDto } from "../form_types";
import { submissionStatuses, type SubmissionStatus } from "../form_schemas";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";

function Detail({
  initial,
  formId,
  reload,
}: {
  initial: SubmissionDto;
  formId: string;
  reload: () => void;
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const [submission, setSubmission] = useState(initial);
  const [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const { data: form } = useResource<FormDto>(`/api/admin/forms/${formId}`);
  const canManage = form?.event
    ? form.event.canReadSubmissions
    : user.capabilities.includes("submissions.manage");

  async function saveStatus() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const next = await request<SubmissionDto>(
        `/api/admin/forms/submissions/${submission.id}`,
        { method: "PATCH", body: JSON.stringify({ status }) },
      );
      setSubmission(next);
      setStatus(next.status);
      setMessage("Review status saved.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        "Permanently delete this submission and its notification records? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await request(`/api/admin/forms/submissions/${submission.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      router.replace(`/admin/inbox?formId=${formId}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const next = await request<SubmissionDto>(
        `/api/admin/forms/submissions/${submission.id}/retry`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setSubmission(next);
      const queued = next.delivery.filter(
        (delivery) =>
          delivery.status === "pending" || delivery.status === "processing",
      ).length;
      setMessage(
        queued > 0
          ? `${queued} notifications are queued for delivery.`
          : "No failed notification matches the current recipients. Review the form's notification settings.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow={`Submission · version ${submission.versionNumber}`}
        title={submission.formTitle}
        description={`Received ${new Date(submission.receivedAt).toLocaleString()}`}
      >
        <Link
          href={`/admin/inbox?formId=${formId}`}
          className="button button-outline"
        >
          Back to responses
        </Link>
      </PageHeading>
      {error && <Notice>{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <div className="forms-workspace">
        <section className="panel">
          <h2>Submitted answers</h2>
          <p className="field-help">
            Field labels and consent wording are preserved from the published
            version used for this submission.
          </p>
          {submission.applicant && (
            <div className="forms-notification-state">
              <strong>Verified applicant</strong>
              <p>
                {submission.applicant.name} · {submission.applicant.email}
              </p>
              <p>
                Membership at submission:{" "}
                {submission.membershipStatus ?? "pending"}. Changing this
                submission’s review status does not approve membership.
              </p>
              <Link href="/admin/members" className="text-link">
                Review membership separately
              </Link>
            </div>
          )}
          {submission.definition.fields
            .filter((field) => Object.hasOwn(submission.answers, field.id))
            .map((field) => (
              <dl className="forms-answer" key={field.id}>
                <dt>
                  {field.label}
                  {field.type === "consent" ? " · Consent" : ""}
                  {field.description && <p>{field.description}</p>}
                </dt>
                <dd>
                  {answerText(submission.answers[field.id]) || "No answer"}
                </dd>
              </dl>
            ))}
        </section>
        <div className="forms-builder-main">
          <section className="panel form-stack">
            <h2>Review</h2>
            {canManage ? (
              <>
                <label>
                  Review status
                  <select
                    value={status}
                    disabled={busy}
                    onChange={(event) =>
                      setStatus(event.target.value as SubmissionStatus)
                    }
                  >
                    {submissionStatuses.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={busy || status === submission.status}
                  onClick={saveStatus}
                >
                  Save status
                </button>
              </>
            ) : (
              <p>Status: {submission.status}</p>
            )}
            {canManage && form?.kind !== "registration" && (
              <button
                type="button"
                className="inline-button forms-delete"
                disabled={busy}
                onClick={remove}
              >
                Delete submission permanently
              </button>
            )}
          </section>
          <section className="panel form-stack">
            <div className="forms-actions forms-between">
              <h2>Notifications</h2>
              <button
                type="button"
                className="inline-button"
                disabled={busy}
                onClick={reload}
              >
                Refresh
              </button>
            </div>
            <p className="field-help">
              The submission is saved independently of email delivery. Sent
              means accepted by the configured mail server.
            </p>
            {submission.delivery.length === 0 ? (
              <p>No email notification was requested for this submission.</p>
            ) : (
              <ul className="forms-delivery-list">
                {submission.delivery.map((delivery) => (
                  <li key={delivery.id}>
                    <strong>{delivery.recipient}</strong>
                    <span>
                      {delivery.status} · {delivery.attempts}{" "}
                      {delivery.attempts === 1 ? "attempt" : "attempts"}
                    </span>
                    {delivery.lastErrorCode && (
                      <span className="field-help">
                        Delivery error: {delivery.lastErrorCode}
                      </span>
                    )}
                    {delivery.sentAt && (
                      <span className="field-help">
                        Sent {new Date(delivery.sentAt).toLocaleString()}
                      </span>
                    )}
                    {(delivery.status === "pending" ||
                      delivery.status === "processing") && (
                      <span className="field-help">Queued for delivery</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage &&
              submission.delivery.some(
                (delivery) => delivery.status === "failed",
              ) && (
                <button
                  type="button"
                  className="button button-outline"
                  disabled={busy}
                  onClick={retry}
                >
                  Retry failed notifications
                </button>
              )}
          </section>
        </div>
      </div>
    </>
  );
}

function LoadedDetail({
  formId,
  submissionId,
  reload,
}: {
  formId: string;
  submissionId: string;
  reload: () => void;
}) {
  const { data, error } = useResource<SubmissionDto>(
    `/api/admin/forms/submissions/${submissionId}`,
  );
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Loading />;
  if (data.formId !== formId)
    return (
      <Notice>This submission does not belong to the selected form.</Notice>
    );
  return <Detail initial={data} formId={formId} reload={reload} />;
}

export function SubmissionDetail({
  formId,
  submissionId,
}: {
  formId: string;
  submissionId: string;
}) {
  const [revision, setRevision] = useState(0);
  return (
    <LoadedDetail
      key={revision}
      formId={formId}
      submissionId={submissionId}
      reload={() => setRevision((value) => value + 1)}
    />
  );
}
