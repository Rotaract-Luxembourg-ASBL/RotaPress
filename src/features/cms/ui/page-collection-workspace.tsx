"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CmsLocale } from "../cms_schemas";
import type { PageQuery, PageRow } from "../cms_workspace_schemas";
import { request, errorMessage } from "@/ui/api";
import { useCurrentUser } from "@/ui/admin-shell";
import { Notice, Loading } from "@/ui/primitives";
import { FilterTabs, CollectionToolbar, UpdatedDate } from "@/ui/collection";
import { ContentStatus } from "@/ui/content-status";
import { Dialog } from "@/ui/dialog";
import { ActionsMenu } from "@/ui/actions-menu";
import { PageQuickEdit } from "./page-quick-edit";
import { PageTreeWorkspace } from "./page-tree-workspace";
import { usePageCollection } from "./use-page-collection";

type Action = "publish" | "unpublish" | "archive" | "restore-archived";
const labels: Record<Action, string> = {
  publish: "Publish",
  unpublish: "Unpublish",
  archive: "Archive",
  "restore-archived": "Restore from archive",
};

export function PageCollectionWorkspace({
  kind,
  locale,
  create,
  canLeave,
}: {
  kind: "page" | "section";
  locale: CmsLocale;
  create: () => void;
  canLeave: () => boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const tree = kind === "page" && params.get("view") === "tree";
  const { capabilities } = useCurrentUser();
  const canPublish = capabilities.includes("cms.publish");
  const query: PageQuery = {
    kind,
    locale,
    search: params.get("search") ?? "",
    status: (["draft", "published", "changes", "archived"].includes(
      params.get("status") ?? "",
    )
      ? params.get("status")
      : "all") as PageQuery["status"],
    sort: (["title", "created", "order"].includes(params.get("sort") ?? "")
      ? params.get("sort")
      : "updated") as PageQuery["sort"],
    collection: (["all", "examples"].includes(params.get("collection") ?? "")
      ? params.get("collection")
      : "website") as PageQuery["collection"],
    page: Math.max(
      1,
      Math.min(100000, Math.floor(Number(params.get("page"))) || 1),
    ),
    pageSize: 25,
  };
  const apiQuery = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  );
  const { data, error, refresh } = usePageCollection(
    tree ? null : `/api/admin/cms/pages?${apiQuery}`,
  );
  const [selection, setSelection] = useState<Map<string, PageRow>>(new Map());
  const [quickEdit, setQuickEdit] = useState<PageRow>();
  const [review, setReview] = useState<{ action: Action; items: PageRow[] }>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  const noun = kind === "page" ? "pages" : "sections";
  const editorHref = (id: string) =>
    `/admin/website/${id}?locale=${locale}&returnTo=${encodeURIComponent(`/admin/website?${params}`)}`;
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values))
      if (value) next.set(key, value);
      else next.delete(key);
    if (!("page" in values)) next.delete("page");
    router.replace(`/admin/website?${next}`, { scroll: false });
  };
  function select(row: PageRow) {
    setProblem("");
    setSelection((current) => {
      const next = new Map(current);
      if (next.has(row.id)) next.delete(row.id);
      else if (next.size < 100) next.set(row.id, row);
      else setProblem("Select up to 100 pages in one action.");
      return next;
    });
  }
  function selectShown() {
    if (!data) return;
    setSelection((current) => {
      const next = new Map(current);
      if (data.items.every((row) => next.has(row.id)))
        for (const row of data.items) next.delete(row.id);
      else
        for (const row of data.items) {
          if (next.size < 100) next.set(row.id, row);
        }
      return next;
    });
  }
  async function apply() {
    if (!review) return;
    setBusy(true);
    setProblem("");
    setMessage("");
    try {
      await request("/api/admin/cms/pages/batch", {
        method: "POST",
        body: JSON.stringify({
          action: review.action,
          items: review.items.map((row) => ({
            id: row.id,
            locale: row.locale,
            expectedRevisionId: row.draftRevisionId,
            archived: row.archived,
          })),
        }),
      });
      setMessage(
        `${labels[review.action]} completed for ${review.items.length} ${noun}.`,
      );
      setSelection(new Map());
      setReview(undefined);
      refresh();
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function duplicate(row: PageRow) {
    if (!canLeave()) return;
    setBusy(true);
    setProblem("");
    try {
      const copy = await request<{ id: string }>(
        `/api/admin/cms/content/${row.id}/duplicate`,
        {
          method: "POST",
          body: JSON.stringify({
            locale,
            title: `${row.title.slice(0, 150)} copy`,
            slug: `${row.slug.slice(0, 85)}-copy`,
          }),
        },
      );
      router.push(editorHref(copy.id));
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="page-collection-workspace"
      aria-label={kind === "page" ? "Website pages" : "Reusable sections"}
    >
      <div className="website-section-heading website-section-actions">
        <div>
          <h2>{kind === "page" ? "Pages" : "Reusable sections"}</h2>
          <p>
            Organize, edit and publish your {noun}. Moving a page keeps its
            address.
          </p>
        </div>
        <button className="button button-accent" onClick={create}>
          New {kind === "page" ? "page" : "reusable section"}
        </button>
      </div>
      {kind === "page" && (
        <div
          className="page-workspace-views"
          role="group"
          aria-label="Pages view"
        >
          <button
            type="button"
            aria-pressed={!tree}
            onClick={() => {
              if (canLeave())
                update({ view: "", page: params.get("page") ?? "" });
            }}
          >
            List view
          </button>
          <button
            type="button"
            aria-pressed={tree}
            onClick={() => {
              if (canLeave())
                update({ view: "tree", page: params.get("page") ?? "" });
            }}
          >
            Page tree
          </button>
        </div>
      )}
      {tree ? (
        <PageTreeWorkspace key={locale} locale={locale} canLeave={canLeave} />
      ) : (
        <>
          {message && <Notice kind="success">{message}</Notice>}
          {(problem || error) && !review && (
            <Notice>
              {problem || error}{" "}
              <button className="inline-button" onClick={refresh}>
                Refresh list
              </button>
            </Notice>
          )}
          <div className="admin-collection">
            <div className="admin-collection-toolbar">
              <FilterTabs
                label="Publication status"
                value={query.status}
                onChange={(status) => update({ status })}
                options={[
                  {
                    value: "all",
                    label: "All active",
                    count: data?.counts.all,
                  },
                  {
                    value: "draft",
                    label: "Drafts",
                    count: data?.counts.draft,
                  },
                  {
                    value: "published",
                    label: "Published",
                    count: data?.counts.published,
                  },
                  {
                    value: "changes",
                    label: "Unpublished changes",
                    count: data?.counts.changes,
                  },
                  {
                    value: "archived",
                    label: "Archived",
                    count: data?.counts.archived,
                  },
                ]}
              />
              <CollectionToolbar
                searchLabel={`Search ${noun}`}
                query={query.search}
                onQuery={(search) => update({ search })}
              >
                <label>
                  Collection
                  <select
                    value={query.collection}
                    onChange={(event) =>
                      update({ collection: event.target.value })
                    }
                  >
                    <option value="website">This website</option>
                    <option value="all">All saved pages</option>
                    <option value="examples">Previous examples</option>
                  </select>
                </label>
                <label>
                  Sort by
                  <select
                    value={query.sort}
                    onChange={(event) => update({ sort: event.target.value })}
                  >
                    <option value="updated">Recently updated</option>
                    <option value="title">Title</option>
                    <option value="created">Newest first</option>
                    <option value="order">Page order</option>
                  </select>
                </label>
              </CollectionToolbar>
            </div>
            <div className="page-selection-toolbar" aria-label="Page selection">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(
                    data?.items.length &&
                    data.items.every((row) => selection.has(row.id)),
                  )}
                  onChange={selectShown}
                  disabled={busy || !data?.items.length}
                />{" "}
                Select all shown
              </label>
              <span role="status">{selection.size} selected</span>
              {selection.size > 0 && (
                <>
                  <button
                    className="button button-outline button-small"
                    onClick={() => setSelection(new Map())}
                    disabled={busy}
                  >
                    Clear selection
                  </button>
                  {canPublish &&
                    (query.status === "archived"
                      ? (["restore-archived"] as const)
                      : (["publish", "unpublish", "archive"] as const)
                    ).map((action) => (
                      <button
                        key={action}
                        className="button button-outline button-small"
                        disabled={busy}
                        onClick={() => {
                          setProblem("");
                          setReview({ action, items: [...selection.values()] });
                        }}
                      >
                        {labels[action]}
                      </button>
                    ))}
                </>
              )}
            </div>
            {!data && !error && <Loading />}
            {data && (
              <ul className="page-workspace-rows">
                {data.items.map((row) => (
                  <li
                    key={row.id}
                    className={
                      selection.has(row.id)
                        ? "page-workspace-row is-selected"
                        : "page-workspace-row"
                    }
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.title}`}
                      checked={selection.has(row.id)}
                      onChange={() => select(row)}
                      disabled={busy}
                    />
                    <div className="page-workspace-identity">
                      <Link
                        href={editorHref(row.id)}
                        onNavigate={(event) => {
                          if (!canLeave()) event.preventDefault();
                        }}
                      >
                        {row.title}
                      </Link>
                      <span className="small muted">
                        {row.parentId
                          ? `Under ${row.parentTitle || "a page in another language"} · `
                          : ""}
                        {row.isHomepage ? "Homepage · " : ""}/pages/{locale}/
                        {row.slug}
                      </span>
                    </div>
                    <ContentStatus item={row} />
                    <span className="small muted">
                      <UpdatedDate value={row.updatedAt} />
                    </span>
                    <div className="cms-actions">
                      {!row.archived && (
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => setQuickEdit(row)}
                        >
                          Quick edit
                        </button>
                      )}
                      <Link
                        className="button button-outline button-small"
                        href={editorHref(row.id)}
                        onNavigate={(event) => {
                          if (!canLeave()) event.preventDefault();
                        }}
                      >
                        Edit
                      </Link>
                      <ActionsMenu
                        label={`Actions for ${row.title}`}
                        disabled={busy}
                      >
                        <Link
                          href={`/admin/website/${row.id}/preview?locale=${locale}`}
                          target="_blank"
                        >
                          Preview saved draft
                        </Link>
                        <button onClick={() => void duplicate(row)}>
                          Duplicate
                        </button>
                        {canPublish &&
                          (row.archived
                            ? (["restore-archived"] as const)
                            : (["publish", "unpublish", "archive"] as const)
                          ).map((action) => (
                            <button
                              key={action}
                              onClick={() => {
                                setProblem("");
                                setReview({ action, items: [row] });
                              }}
                            >
                              {labels[action]}
                            </button>
                          ))}
                      </ActionsMenu>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data && !data.items.length && (
              <div className="empty-state">
                <h3>No {noun} in this view</h3>
                <button
                  className="button button-outline"
                  onClick={() =>
                    update({ search: "", status: "all", collection: "all" })
                  }
                >
                  Clear filters
                </button>
              </div>
            )}
            {data && (
              <div
                className="page-selection-toolbar"
                aria-label="Page list pagination"
              >
                <span role="status">
                  {data.total} matching {noun} · Page {data.page} of{" "}
                  {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                <button
                  className="button button-outline button-small"
                  disabled={data.page <= 1}
                  onClick={() => update({ page: String(data.page - 1) })}
                >
                  Previous
                </button>
                <button
                  className="button button-outline button-small"
                  disabled={data.page * data.pageSize >= data.total}
                  onClick={() => update({ page: String(data.page + 1) })}
                >
                  Next
                </button>
              </div>
            )}
          </div>
          {quickEdit && (
            <PageQuickEdit
              item={quickEdit}
              close={() => setQuickEdit(undefined)}
              saved={() => {
                setQuickEdit(undefined);
                setSelection(new Map());
                refresh();
              }}
            />
          )}
          {review && (
            <Dialog
              title={`${labels[review.action]} ${review.items.length} ${noun}`}
              onClose={() => setReview(undefined)}
              canClose={() => !busy}
            >
              {problem && (
                <Notice>
                  {problem}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setReview(undefined);
                      setSelection(new Map());
                      setProblem("");
                      refresh();
                    }}
                  >
                    Clear selection and refresh
                  </button>
                </Notice>
              )}
              <p>
                {review.action === "publish"
                  ? "Visitors will see these exact saved drafts. Unsaved editor changes are not included."
                  : review.action === "archive"
                    ? "These items will leave the website in every language. Their history is kept, and they can be restored as private drafts. Child pages move to the top level."
                    : review.action === "restore-archived"
                      ? "Restore these items in every language as private drafts. Their previous addresses are kept; nothing is published."
                      : "These language versions will no longer be public. Saved drafts and history are kept."}
              </p>
              <ul>
                {review.items.map((row) => (
                  <li key={row.id}>
                    {row.title} · {row.locale.toUpperCase()}
                  </li>
                ))}
              </ul>
              <div className="form-actions">
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => setReview(undefined)}
                >
                  Cancel
                </button>
                <button
                  className="button button-accent"
                  disabled={busy}
                  onClick={() => void apply()}
                >
                  {busy ? "Working…" : labels[review.action]}
                </button>
              </div>
            </Dialog>
          )}
        </>
      )}
    </section>
  );
}
