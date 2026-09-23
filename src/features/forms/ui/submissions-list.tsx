"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { FormDto, SubmissionList, SubmissionSummary } from "../form_types";
import { submissionStatuses, type SubmissionFilter } from "../form_schemas";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, useResource } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";

export function notificationSummary(value: SubmissionSummary["notifications"]) {
  const parts = [
    value.pending + value.processing > 0
      ? `${value.pending + value.processing} queued`
      : "",
    value.sent > 0 ? `${value.sent} sent` : "",
    value.failed > 0 ? `${value.failed} failed` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No notifications requested";
}

function SubmissionResults({
  formId,
  query,
}: {
  formId: string;
  query: string;
}) {
  const { data, error } = useResource<SubmissionList>(
    `/api/admin/forms/${formId}/submissions${query}`,
  );
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Loading />;
  return (
    <>
      <ul className="forms-submission-list">
        {data.submissions.map((submission) => (
          <li key={submission.id}>
            <Link href={`/admin/forms/${formId}/submissions/${submission.id}`}>
              <strong>
                {new Date(submission.receivedAt).toLocaleString()}
              </strong>
              <span className="muted">
                Version {submission.versionNumber} ·{" "}
                {notificationSummary(submission.notifications)}
              </span>
            </Link>
            <span className="forms-badge">{submission.status}</span>
          </li>
        ))}
        {data.submissions.length === 0 && (
          <li>No submissions match these filters.</li>
        )}
      </ul>
      {data.hasMore && (
        <p className="field-help">
          Showing the most recent 100 matching submissions. Narrow the dates or
          export the filtered results.
        </p>
      )}
    </>
  );
}

export function SubmissionsList({ formId }: { formId: string }) {
  const user = useCurrentUser();
  const { data: form, error: formError } = useResource<FormDto>(
    `/api/admin/forms/${formId}`,
  );
  const [status, setStatus] = useState<SubmissionFilter["status"] | "">("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState(false);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    if (after && before && after > before) {
      setError("The start date must come before the end date.");
      return;
    }
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (after) params.set("after", new Date(`${after}T00:00:00`).toISOString());
    if (before)
      params.set("before", new Date(`${before}T23:59:59.999`).toISOString());
    setQuery(params.size ? `?${params}` : "");
  }

  async function download() {
    setExporting(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/admin/forms/${formId}/submissions/export${query}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "The export could not be prepared.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `form-${formId}-submissions.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setExporting(false);
    }
  }

  if (
    form &&
    !(form.event
      ? form.event.canReadSubmissions
      : user.capabilities.includes("submissions.read"))
  )
    return <Notice>You do not have permission to read submissions.</Notice>;
  return (
    <>
      <PageHeading
        eyebrow="Private submissions"
        title={form?.draft.title ?? "Submissions"}
        description="Only authorized club reviewers can access these answers."
      >
        <Link href={`/admin/forms/${formId}`} className="button button-outline">
          Back to form
        </Link>
      </PageHeading>
      {formError && <Notice>{formError}</Notice>}
      {error && <Notice>{error}</Notice>}
      <section className="panel">
        <form className="forms-filters" onSubmit={filter}>
          <label>
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              <option value="">All statuses</option>
              {submissionStatuses.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            From date
            <input
              type="date"
              value={after}
              onChange={(event) => setAfter(event.target.value)}
            />
          </label>
          <label>
            Through date
            <input
              type="date"
              value={before}
              onChange={(event) => setBefore(event.target.value)}
            />
          </label>
          <button className="button button-outline">Apply filters</button>
          {(form?.event
            ? form.event.canReadSubmissions
            : user.capabilities.includes("submissions.export")) && (
            <button
              type="button"
              className="button button-outline"
              disabled={exporting}
              onClick={download}
            >
              {exporting ? "Preparing…" : "Export filtered CSV"}
            </button>
          )}
        </form>
        <SubmissionResults key={query} formId={formId} query={query} />
      </section>
    </>
  );
}
