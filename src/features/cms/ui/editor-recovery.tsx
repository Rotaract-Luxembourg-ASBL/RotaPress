"use client";
import { useState } from "react";
import type { EditorDocument } from "./use-editor-document";
import type { CmsDetail } from "../cms_schemas";
import { useResource } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import { EditorChangeComparison } from "./editor-change-comparison";

export function EditorRecovery({
  document: doc,
}: {
  document: EditorDocument;
}) {
  const [comparing, setComparing] = useState(false);
  const latest = useResource<CmsDetail>(
    comparing
      ? `/api/admin/cms/content/${doc.detail.id}?locale=${doc.detail.locale}`
      : null,
  );
  const recovery = doc.checkpoint;
  const snapshot = latest.data;
  if (doc.readOnly) return null;
  return (
    <>
      {recovery.candidate && (
        <div className="editor-recovery-banner" role="status">
          <div>
            <strong>Unsaved work is available</strong>
            <p>
              Your private recovery copy was saved{" "}
              {new Date(recovery.candidate.updatedAt).toLocaleString()}.
              {recovery.candidate.stale &&
                " Another editor has saved a newer draft."}
            </p>
          </div>
          <button
            className="button button-outline button-small"
            disabled={doc.busy}
            onClick={() => {
              if (
                !doc.dirty ||
                window.confirm(
                  "Replace your current unsaved input with the recovery copy?",
                )
              )
                doc.recoverCheckpoint();
            }}
          >
            Recover my changes
          </button>
          <button
            className="button button-outline button-small"
            disabled={doc.busy}
            onClick={() =>
              void recovery.discard().catch(() => recovery.reload())
            }
          >
            Discard recovery copy
          </button>
        </div>
      )}
      {recovery.problem && (
        <div className="editor-recovery-banner" role="status">
          <span>
            {recovery.problem} Your open editor still contains your changes.
          </span>
          <button
            className="button button-outline button-small"
            disabled={doc.busy}
            onClick={
              recovery.blocked || !recovery.ready
                ? recovery.reload
                : recovery.retry
            }
          >
            {recovery.blocked ? "Review recovery copy" : "Retry recovery"}
          </button>
        </div>
      )}
      {doc.conflicted && (
        <div className="editor-recovery-banner" role="alert">
          <span>
            The saved draft changed while you were editing. Compare both
            versions before saving again.
          </span>
          <button
            className="button button-outline button-small"
            disabled={doc.busy}
            onClick={() => setComparing(true)}
          >
            Compare changes
          </button>
        </div>
      )}
      {comparing && (
        <Dialog
          title="Compare with the latest draft"
          onClose={() => setComparing(false)}
        >
          {doc.error && (
            <Notice>
              {doc.error}{" "}
              <button onClick={latest.refresh}>Refresh comparison</button>
            </Notice>
          )}
          {latest.error && (
            <Notice>
              {latest.error} <button onClick={latest.refresh}>Try again</button>
            </Notice>
          )}
          {snapshot && (
            <>
              <div className="editor-recovery-comparison">
                <section>
                  <h3>Your open changes</h3>
                  <p>{doc.metadata.title}</p>
                  <p>
                    /pages/{doc.detail.locale}/{doc.metadata.slug}
                  </p>
                  <p>{doc.data.content.length} top-level blocks</p>
                </section>
                <section>
                  <h3>Latest saved draft</h3>
                  <p>{snapshot.draft.title}</p>
                  <p>
                    /pages/{snapshot.locale}/{snapshot.draft.slug}
                  </p>
                  <p>{snapshot.draft.data.content.length} top-level blocks</p>
                  <a
                    href={`/admin/website/${doc.detail.id}/preview?locale=${doc.detail.locale}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview latest saved draft
                  </a>
                </section>
              </div>
              <div className="editor-recovery-comparison">
                <p>
                  <b>Your description:</b> {doc.metadata.description || "Empty"}
                </p>
                <p>
                  <b>Saved description:</b>{" "}
                  {snapshot.draft.description || "Empty"}
                </p>
              </div>
              <EditorChangeComparison
                mine={doc.data.content}
                latest={snapshot.draft.data.content}
              />
              <p>
                Keeping your changes uses your complete open document for the
                next save. Changes made by another editor are not merged
                automatically. The published page stays unchanged.
              </p>
              <div className="form-actions">
                <button
                  className="button button-outline"
                  disabled={doc.busy}
                  onClick={async () => {
                    if (await doc.reviewLatest(false, snapshot.draft.id))
                      setComparing(false);
                  }}
                >
                  Use latest saved draft
                </button>
                <button
                  className="button button-accent"
                  disabled={doc.busy}
                  onClick={async () => {
                    if (await doc.reviewLatest(true, snapshot.draft.id))
                      setComparing(false);
                  }}
                >
                  Keep my changes
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
