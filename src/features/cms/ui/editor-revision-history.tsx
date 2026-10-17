"use client";
import { useState } from "react";
import type { RevisionDto } from "../cms_schemas";
import type { EditorDocument } from "./use-editor-document";
import { useResource } from "@/ui/api";
import { useRequestResource } from "@/ui/request-resource";
import { CollectionPagination } from "@/ui/collection-pagination";
import type { RevisionCollection } from "../cms_commands";
import { Notice } from "@/ui/primitives";
import { EditorChangeComparison } from "./editor-change-comparison";

export function EditorRevisionHistory({
  document: doc,
}: {
  document: EditorDocument;
}) {
  const [comparing, setComparing] = useState<string>();
  const [page, setPage] = useState(1);
  const history = useRequestResource<RevisionCollection>(
    `/api/admin/cms/content/${doc.detail.id}/revisions?locale=${doc.detail.locale}&page=${page}&pageSize=30`,
  );
  const revision = useResource<{ revision: RevisionDto }>(
    comparing
      ? `/api/admin/cms/content/${doc.detail.id}/revisions/${comparing}?locale=${doc.detail.locale}`
      : null,
  );
  const snapshot =
    revision.data && revision.data.revision.id === comparing
      ? revision.data.revision
      : undefined;
  return (
    <>
      <p className="editor-help">
        Compare a saved version with your current editor. Restoring creates a
        new private draft; the published page stays unchanged.
      </p>
      {doc.dirty && (
        <p className="editor-inline-warning">
          Save current changes before restoring a revision.
        </p>
      )}
      {history.error && (
        <Notice>
          {history.error} <button onClick={history.refresh}>Try again</button>
        </Notice>
      )}
      {history.loading && <p role="status">Loading revision history…</p>}
      <ol className="editor-revision-list" aria-busy={history.loading}>
        {history.data?.revisions.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <time>{new Date(item.createdAt).toLocaleString()}</time>
              <span>
                {item.id === doc.detail.draft.id
                  ? "Current draft"
                  : "Saved revision"}
                {item.id === doc.detail.publishedRevisionId
                  ? " · Published"
                  : ""}
              </span>
            </div>
            <div className="cms-actions">
              <button
                className="button button-outline button-small"
                aria-pressed={comparing === item.id}
                disabled={history.loading}
                onClick={() => setComparing(item.id)}
              >
                Compare
              </button>
              <button
                className="button button-outline button-small"
                disabled={
                  history.loading ||
                  doc.busy ||
                  doc.dirty ||
                  doc.readOnly ||
                  item.id === doc.detail.draft.id
                }
                onClick={() => void doc.operation("restore", item.id)}
              >
                Restore to draft
              </button>
            </div>
          </li>
        ))}
      </ol>
      {history.data && (
        <CollectionPagination
          {...history.data}
          noun="revisions"
          onPage={(next) => {
            setComparing(undefined);
            setPage(next);
          }}
        />
      )}
      {comparing && (
        <section
          aria-label="Revision comparison"
          aria-busy={!snapshot && !revision.error}
        >
          <h3>Compare saved revision</h3>
          {revision.error && (
            <Notice>
              {revision.error}{" "}
              <button onClick={revision.refresh}>Try again</button>
            </Notice>
          )}
          {!snapshot && !revision.error && (
            <p role="status">Loading saved content…</p>
          )}
          {snapshot && (
            <>
              <div className="editor-recovery-comparison">
                <section>
                  <h4>Current editor</h4>
                  <p>{doc.metadata.title}</p>
                  <p>
                    /pages/{doc.detail.locale}/{doc.metadata.slug}
                  </p>
                  <p>{doc.metadata.description || "No description"}</p>
                </section>
                <section>
                  <h4>Selected revision</h4>
                  <p>{snapshot.title}</p>
                  <p>
                    /pages/{doc.detail.locale}/{snapshot.slug}
                  </p>
                  <p>{snapshot.description || "No description"}</p>
                </section>
              </div>
              {doc.metadata.socialImageId !== snapshot.socialImageId && (
                <p>Social sharing image differs.</p>
              )}
              {JSON.stringify(doc.metadata.data.root) !==
                JSON.stringify(snapshot.data.root) && (
                <p>Page appearance settings differ.</p>
              )}
              <EditorChangeComparison
                mine={doc.data.content}
                latest={snapshot.data.content}
                mineLabel="Current editor"
                latestLabel="Selected revision"
              />
            </>
          )}
        </section>
      )}
    </>
  );
}
