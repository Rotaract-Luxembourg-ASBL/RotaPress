"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { FormDto, SubmissionList, SubmissionSummary } from "../form_types";
import { submissionStatuses, type SubmissionFilter } from "../form_schemas";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, useResource } from "@/ui/api";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { useCollectionLocation } from "@/ui/collection-location";
import { CollectionPagination } from "@/ui/collection-pagination";

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
  onPage,
}: {
  formId: string;
  query: string;
  onPage: (page: number) => void;
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
            <Link
              href={`/admin/forms/${formId}/submissions/${submission.id}?returnTo=${encodeURIComponent(`/admin/forms/${formId}/submissions${query}`)}`}
            >
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
      <CollectionPagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        noun="responses"
        onPage={onPage}
      />
    </>
  );
}

export function SubmissionsList({ formId }: { formId: string }) {
  const user = useCurrentUser();
  const location = useCollectionLocation();
  const { data: form, error: formError } = useResource<FormDto>(
    `/api/admin/forms/${formId}`,
  );
  const [status, setStatus] = useState<SubmissionFilter["status"] | "">(
    submissionStatuses.find(
      (value) => value === location.params.get("status"),
    ) ?? "",
  );
  const [after, setAfter] = useState(
    (location.params.get("after") ?? "").slice(0, 10),
  );
  const [before, setBefore] = useState(
    (location.params.get("before") ?? "").slice(0, 10),
  );
  const queryParams = new URLSearchParams();
  for (const key of ["status", "after", "before"]) {
    const value = location.params.get(key);
    if (value) queryParams.set(key, value);
  }
  queryParams.set("page", String(location.page));
  const query = `?${queryParams}`;
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState(false);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    if (after && before && after > before) {
      setError("The start date must come before the end date.");
      return;
    }
    location.change({
      status,
      after: after ? new Date(`${after}T00:00:00`).toISOString() : "",
      before: before ? new Date(`${before}T23:59:59.999`).toISOString() : "",
    });
  }

  async function download() {
    setExporting(true);
    setError(undefined);
    try {
      // History updates immediately; React may still be rendering the previous
      // collection when someone exports directly after applying filters.
      const current = new URLSearchParams(window.location.search);
      const exportQuery = new URLSearchParams();
      for (const key of ["status", "after", "before"]) {
        const value = current.get(key);
        if (value) exportQuery.set(key, value);
      }
      const response = await fetch(
        `/api/admin/forms/${formId}/submissions/export?${exportQuery}`,
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
        <SubmissionResults
          key={query}
          formId={formId}
          query={query}
          onPage={(page) => location.change({ page }, false)}
        />
      </section>
    </>
  );
}
