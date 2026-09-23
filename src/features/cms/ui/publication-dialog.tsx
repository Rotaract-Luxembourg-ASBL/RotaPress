"use client";
import { useEffect, useState } from "react";
import { Dialog } from "@/ui/dialog";
import { Loading, Notice } from "@/ui/primitives";
import { useResource, request, errorMessage } from "@/ui/api";
import { isSitePart } from "../cms_schemas";
import type { PublicationScheduleDto } from "../publication_schemas";
import type { EditorDocument } from "./use-editor-document";

export function PublicationDialog({
  document: doc,
  canPublish,
  close,
}: {
  document: EditorDocument;
  canPublish: boolean;
  close: () => void;
}) {
  const { detail } = doc;
  const base = `/api/admin/cms/content/${detail.id}`;
  const { data, error, refresh } = useResource<PublicationScheduleDto>(
    `${base}/schedule?locale=${detail.locale}`,
  );
  const [date, setDate] = useState("");
  const reflectPublication = doc.reflectPublication;
  useEffect(() => {
    if (data) reflectPublication(data.publishedRevisionId);
  }, [data, reflectPublication]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState<{
    action: "schedule" | "cancel-schedule";
    dueAt?: string;
    jobId: string | null;
    revisionId: string;
    requestId: string;
  }>();
  const locked = doc.busy || doc.readOnly || !canPublish || busy;
  function open(action: "schedule" | "cancel-schedule") {
    const due = new Date(date);
    if (action === "schedule" && (!date || !Number.isFinite(due.getTime()))) {
      setProblem("Choose a publication date and time.");
      return;
    }
    setProblem(undefined);
    setConfirmed(false);
    setReview({
      action,
      dueAt: action === "schedule" ? due.toISOString() : undefined,
      jobId: data?.activeId ?? null,
      revisionId: detail.draft.id,
      requestId: crypto.randomUUID(),
    });
  }
  return (
    <Dialog
      title="Scheduled publication"
      onClose={close}
      canClose={() => !busy}
    >
      <div className="form-stack">
        <p>
          <strong>{detail.draft.title}</strong> · {detail.locale.toUpperCase()}
        </p>
        {isSitePart(detail.kind) ? (
          <p>
            This shared {detail.kind} applies to every published page in this
            language, including future pages.
          </p>
        ) : detail.kind === "section" ? (
          <p>This shared section changes the pages that reference it.</p>
        ) : (
          <p>Applies to this page in this language.</p>
        )}
        {detail.kind !== "page" && (
          <p>
            Currently affected:{" "}
            {detail.affectedPages.length
              ? detail.affectedPages.map((p) => p.title).join(", ")
              : "No published pages yet."}
          </p>
        )}
        <p>
          Only the saved revision is scheduled. Saving another draft, publishing
          or unpublishing invalidates it. Your current session and publication
          permissions must still be valid when it runs.
        </p>
        {(error || problem) && <Notice>{problem || error}</Notice>}
        {!data ? (
          <Loading />
        ) : review ? (
          <>
            <h3>
              {review.action === "schedule"
                ? "Review publication time"
                : "Review cancellation"}
            </h3>
            <p>
              {review.action === "schedule"
                ? `${review.jobId ? "Replace the existing schedule and publish" : "Publish"} this saved revision on ${new Date(review.dueAt!).toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`
                : "Cancel the selected pending publication. The current public website will stay unchanged."}
            </p>
            {review.action === "schedule" && (
              <p>
                Content, media and referenced forms are checked again at
                execution. A delayed or failed job does not count as
                publication.
              </p>
            )}
            <label className="forms-check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm this publication schedule action.
            </label>
            <div className="forms-actions">
              <button
                className="button button-accent"
                disabled={locked || !confirmed}
                onClick={async () => {
                  setBusy(true);
                  setProblem(undefined);
                  try {
                    await request(`${base}/${review.action}`, {
                      method: "POST",
                      body: JSON.stringify({
                        locale: detail.locale,
                        confirmed: true,
                        ...(review.action === "schedule"
                          ? {
                              expectedRevisionId: review.revisionId,
                              dueAt: review.dueAt,
                              expectedJobId: review.jobId,
                              requestId: review.requestId,
                            }
                          : { jobId: review.jobId }),
                      }),
                    });
                    setReview(undefined);
                    setConfirmed(false);
                    refresh();
                  } catch (cause) {
                    setProblem(errorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Saving…" : "Confirm publication schedule"}
              </button>
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  setReview(undefined);
                  refresh();
                }}
              >
                Back to schedule
              </button>
            </div>
          </>
        ) : (
          <>
            {doc.dirty && (
              <Notice kind="info">
                Save your current changes before scheduling them.
              </Notice>
            )}
            {canPublish && (
              <>
                <label className="field">
                  Publication date and time
                  <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={locked}
                  />
                </label>
                <p className="small muted">
                  Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                  The local runner processes due work while the app's
                  development command is running.
                </p>
                <div className="forms-actions">
                  <button
                    className="button button-accent"
                    disabled={
                      locked ||
                      doc.dirty ||
                      detail.publishedRevisionId === detail.draft.id
                    }
                    onClick={() => open("schedule")}
                  >
                    {data.activeId
                      ? "Review replacing schedule"
                      : "Review publication schedule"}
                  </button>
                  {data.activeId && (
                    <button
                      className="button button-outline"
                      disabled={locked}
                      onClick={() => open("cancel-schedule")}
                    >
                      Review cancelling schedule
                    </button>
                  )}
                </div>
              </>
            )}
            <button
              className="button button-outline"
              disabled={busy}
              onClick={refresh}
            >
              Refresh publication status
            </button>
            <h3>Recent publication jobs</h3>
            {!data.jobs.length && (
              <p>No scheduled publications for this content.</p>
            )}
            <ul className="content-rows">
              {data.jobs.map((job) => (
                <li className="content-row" key={job.id}>
                  <div>
                    <strong>
                      {job.delayed
                        ? "Delayed — waiting for the runner"
                        : {
                            pending: "Scheduled",
                            processing: "Publishing",
                            succeeded: "Published",
                            cancelled: "Cancelled",
                            failed: "Failed",
                          }[job.status]}
                    </strong>
                    <p>
                      {new Date(job.dueAt).toLocaleString()} · {job.attempts}{" "}
                      {job.attempts === 1 ? "attempt" : "attempts"}
                    </p>
                    <p className="small muted">
                      {job.revisionId === detail.draft.id
                        ? "Current saved revision"
                        : "Earlier saved revision"}
                    </p>
                    {job.message && <p>{job.message}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}
