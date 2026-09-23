"use client";
import { useState } from "react";
import { request, errorMessage } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import type { ReconciliationJobDto } from "../job_schemas";

const labels = {
  pending: "Queued",
  processing: "In progress",
  succeeded: "Complete",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function ReconciliationJobs({
  jobs,
  endpoint,
  refresh,
  sourceId,
}: {
  jobs: ReconciliationJobDto[];
  endpoint: string;
  refresh: () => void;
  sourceId: string;
}) {
  const [review, setReview] = useState<string>();
  const [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [problem, setProblem] = useState<string>();
  if (!jobs.length) return null;
  return (
    <div className="form-stack" aria-label="Queued reconciliations">
      <div>
        <h3>Reconciliation requests</h3>
        <p>
          You can leave this page while a request runs. Signing out or losing
          event access cancels work that has not completed.
        </p>
      </div>
      <ul className="content-rows">
        {jobs.map((job) => (
          <li className="content-row" key={job.id}>
            <div>
              <strong>{labels[job.status]}</strong>
              <p className="small muted">
                Requested {new Date(job.createdAt).toLocaleString()} ·{" "}
                {job.attempts} of 3 attempts
              </p>
              {job.status === "pending" && (
                <p className="small">
                  Available after {new Date(job.availableAt).toLocaleString()}.
                  Refresh to see progress.
                </p>
              )}
              {job.message && <p>{job.message}</p>}
            </div>
            {["pending", "processing"].includes(job.status) && (
              <button
                className="button button-outline"
                onClick={() => {
                  setReview(job.id);
                  setConfirmed(false);
                  setProblem(undefined);
                }}
              >
                Review cancelling request
              </button>
            )}
          </li>
        ))}
      </ul>
      {review && (
        <Dialog
          title="Cancel queued reconciliation"
          onClose={() => setReview(undefined)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              Cancel this request, including any retry. The last complete guest
              projection stays available. An import that has already committed
              cannot be undone here.
            </p>
            {problem && <Notice>{problem}</Notice>}
            <label className="forms-check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirm cancellation of this request.
            </label>
            <button
              className="button button-accent"
              disabled={busy || !confirmed}
              onClick={async () => {
                setBusy(true);
                setProblem(undefined);
                try {
                  await request(`${endpoint}/cancel`, {
                    method: "POST",
                    body: JSON.stringify({
                      id: review,
                      sourceId,
                      confirmed: true,
                    }),
                  });
                  setReview(undefined);
                  refresh();
                } catch (cause) {
                  setProblem(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Cancelling…" : "Confirm cancellation"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
