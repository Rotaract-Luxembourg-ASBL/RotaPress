"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { answerText } from "../form_elements";
import { errorMessage, request, useResource } from "@/ui/api";
import { Loading, Notice } from "@/ui/primitives";
import type { InboxMessage } from "../inbox_schemas";
import type { SubmissionDto } from "../form_types";
import { submissionStatuses, type SubmissionStatus } from "../form_schemas";
const statusNames = { new: "New", reviewing: "In progress", closed: "Closed" };

export function InboxMessagePanel({
  message,
  selectionRequest,
  onSaved,
  onBack,
  returnTo,
}: {
  message: InboxMessage;
  selectionRequest: number;
  onSaved: () => void;
  onBack: () => void;
  returnTo: string;
}) {
  const { data, error, refresh } = useResource<SubmissionDto>(
    `/api/admin/forms/submissions/${message.id}`,
  );
  const [status, setStatus] = useState<SubmissionStatus>(message.status);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const lastSelection = useRef(0);
  useEffect(() => {
    if (!selectionRequest) {
      lastSelection.current = 0;
      return;
    }
    if (!data || selectionRequest === lastSelection.current) return;
    lastSelection.current = selectionRequest;
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "center" });
  }, [data, selectionRequest]);
  async function save() {
    if (!data) return;
    setBusy(true);
    setFailure(undefined);
    setNotice(undefined);
    try {
      await request(`/api/admin/forms/submissions/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, expectedVersion: data.version }),
      });
      setNotice("Review status saved.");
      refresh();
      onSaved();
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel inbox-detail" aria-label="Selected response">
      <button
        type="button"
        className="inline-button inbox-back"
        onClick={onBack}
      >
        Back to responses
      </button>
      <p className="eyebrow">{message.formTitle}</p>
      <h2 ref={heading} tabIndex={-1}>
        {message.name}
      </h2>
      <p>{message.email}</p>
      {message.eventTitle && (
        <p className="field-help">Event: {message.eventTitle}</p>
      )}
      <p className="field-help">
        {message.verified
          ? "Submitted with a verified account"
          : "Contact details supplied by the visitor"}
      </p>
      {error && (
        <Notice>
          {error}{" "}
          <button type="button" className="inline-button" onClick={refresh}>
            Retry response
          </button>
        </Notice>
      )}
      {failure && (
        <Notice>
          {failure}{" "}
          <button
            type="button"
            className="inline-button"
            disabled={busy}
            onClick={() => {
              refresh();
              setFailure(undefined);
            }}
          >
            Reload response
          </button>
        </Notice>
      )}
      {notice && <Notice kind="success">{notice}</Notice>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <p className="muted">
            {data.formTitle} · version {data.versionNumber} ·{" "}
            {new Date(data.receivedAt).toLocaleString()}
          </p>
          <dl className="inbox-answers">
            {data.definition.fields
              .filter((field) => Object.hasOwn(data.answers, field.id))
              .map((field) => (
                <div key={field.id}>
                  <dt>{field.label}</dt>
                  <dd>{answerText(data.answers[field.id]) || "No answer"}</dd>
                </div>
              ))}
          </dl>
          <div className="inbox-status">
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
                    {statusNames[value]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button-accent"
              disabled={busy}
              onClick={save}
            >
              {busy ? "Saving…" : "Save status"}
            </button>
          </div>
          <p className="field-help">
            Email delivery: {data.notifications.sent} sent ·{" "}
            {data.notifications.pending + data.notifications.processing} queued
            · {data.notifications.failed} failed.
          </p>
          <div className="forms-actions">
            <Link
              href={`/admin/forms/${message.formId}/submissions/${message.id}?returnTo=${encodeURIComponent(returnTo)}`}
              className="text-link"
            >
              Full response & delivery
            </Link>
            <Link href={`/admin/forms/${message.formId}`} className="text-link">
              Form & notifications
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
