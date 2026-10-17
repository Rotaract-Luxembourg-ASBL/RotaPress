"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";
import { request, errorMessage, ApiError } from "@/ui/api";
import type { PageCollection, PageRow } from "../cms_workspace_schemas";
import { usePageCollection } from "./use-page-collection";

export function PageQuickEdit({
  item,
  close,
  saved,
}: {
  item: PageRow;
  close: () => void;
  saved: () => void;
}) {
  const [baseline, setBaseline] = useState(item);
  const [latest, setLatest] = useState<PageRow>();
  const [conflicted, setConflicted] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [slug, setSlug] = useState(item.slug);
  const [parentId, setParentId] = useState(item.parentId ?? "");
  const [search, setSearch] = useState("");
  const [parentPage, setParentPage] = useState(1);
  const [position, setPosition] = useState(item.position);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const parents = usePageCollection(
    `/api/admin/cms/pages?kind=page&collection=all&page=${parentPage}&pageSize=25&sort=title&locale=${item.locale}&search=${encodeURIComponent(search)}`,
  );
  const dirty =
    title !== baseline.title ||
    slug !== baseline.slug ||
    parentId !== (baseline.parentId ?? "") ||
    position !== baseline.position;
  const canClose = () =>
    !busy && (!dirty || window.confirm("Discard these unsaved page details?"));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || conflicted) return;
    setBusy(true);
    setProblem("");
    try {
      await request(`/api/admin/cms/content/${item.id}/quick-edit`, {
        method: "POST",
        body: JSON.stringify({
          locale: item.locale,
          expectedRevisionId: baseline.draftRevisionId,
          expectedPlacementVersion: baseline.placementVersion,
          title,
          slug,
          parentId: parentId || null,
          position,
        }),
      });
      saved();
    } catch (cause) {
      setProblem(errorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) {
        setConflicted(true);
        setLatest(undefined);
      }
    } finally {
      setBusy(false);
    }
  }
  async function compareLatest() {
    setBusy(true);
    setProblem("");
    setLatest(undefined);
    try {
      const current = await request<PageCollection>(
        `/api/admin/cms/pages?id=${item.id}&kind=${item.kind}&collection=all&locale=${item.locale}`,
      );
      if (!current.items[0])
        throw new Error(
          "This page is no longer available. Your open details have been kept.",
        );
      setLatest(current.items[0]);
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function reviewLatest(keepMine: boolean) {
    if (!latest) return;
    if (!keepMine) {
      setTitle(latest.title);
      setSlug(latest.slug);
      setParentId(latest.parentId ?? "");
      setPosition(latest.position);
    }
    setBaseline(latest);
    setLatest(undefined);
    setConflicted(false);
    setProblem("");
  }
  const parentTitle = !parentId
    ? "Top level"
    : (parents.data?.items.find((page) => page.id === parentId)?.title ??
      (parentId === baseline.parentId ? baseline.parentTitle : null) ??
      "Selected parent page");
  return (
    <Dialog
      title={`Quick edit: ${item.title}`}
      onClose={close}
      canClose={canClose}
    >
      <form className="form-stack" onSubmit={save}>
        {problem && <Notice>{problem}</Notice>}
        {conflicted && (
          <section
            aria-label="Review changed page details"
            className="form-stack"
          >
            <Notice>
              The saved page changed. Your input is kept. Review its latest
              details before saving again.
            </Notice>
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => void compareLatest()}
            >
              {latest ? "Refresh comparison" : "Compare latest details"}
            </button>
            {latest && (
              <>
                <div className="editor-recovery-comparison">
                  <section>
                    <h3>Your open details</h3>
                    <p>Title: {title}</p>
                    <p>
                      Address: /pages/{item.locale}/{slug}
                    </p>
                    <p>Parent: {parentTitle}</p>
                    <p>Order: {position}</p>
                  </section>
                  <section>
                    <h3>Latest saved details</h3>
                    <p>Title: {latest.title}</p>
                    <p>
                      Address: /pages/{item.locale}/{latest.slug}
                    </p>
                    <p>
                      Parent:{" "}
                      {latest.parentId
                        ? (latest.parentTitle ?? "Parent in another language")
                        : "Top level"}
                    </p>
                    <p>Order: {latest.position}</p>
                  </section>
                </div>
                <p>
                  Keeping your details uses all four open fields for the next
                  save. The latest page blocks remain intact. A further change
                  requires another review.
                </p>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => reviewLatest(false)}
                  >
                    Use latest details
                  </button>
                  <button
                    type="button"
                    className="button button-accent"
                    onClick={() => reviewLatest(true)}
                  >
                    Keep my details
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
            disabled={busy}
          />
        </label>
        <label>
          Page address
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={100}
            disabled={busy}
          />
          <span className="field-help">
            /pages/{item.locale}/{slug}. Address changes take effect when this
            draft is published.
          </span>
        </label>
        {item.kind === "page" && (
          <>
            <label>
              Find a parent page
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setParentPage(1);
                }}
                disabled={busy}
              />
            </label>
            {parents.error && (
              <Notice>
                {parents.error}{" "}
                <button type="button" onClick={parents.refresh}>
                  Try again
                </button>
              </Notice>
            )}
            <label>
              Parent page
              <select
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                disabled={busy || !parents.data}
              >
                <option value="">Top level</option>
                {parentId &&
                  !parents.data?.items.some((page) => page.id === parentId) && (
                    <option value={parentId}>Current parent</option>
                  )}
                {parents.data?.items
                  .filter((page) => page.id !== item.id)
                  .map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                    </option>
                  ))}
              </select>
              <span className="field-help">
                Organizes your pages without changing their addresses or menu.
              </span>
            </label>
            {parents.data && parents.data.total > parents.data.pageSize && (
              <nav
                className="page-tree-pagination"
                aria-label="Parent page choices"
              >
                <span>
                  Page {parents.data.page} of{" "}
                  {Math.ceil(parents.data.total / parents.data.pageSize)} ·{" "}
                  {parents.data.total} pages
                </span>
                <button
                  type="button"
                  disabled={busy || parents.data.page <= 1}
                  onClick={() => setParentPage(parents.data!.page - 1)}
                >
                  Previous parents
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    parents.data.page * parents.data.pageSize >=
                      parents.data.total
                  }
                  onClick={() => setParentPage(parents.data!.page + 1)}
                >
                  Next parents
                </button>
              </nav>
            )}
          </>
        )}
        <label>
          Order
          <input
            type="number"
            min={0}
            max={100000}
            value={position}
            disabled={busy}
            onChange={(event) => setPosition(Number(event.target.value))}
          />
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => {
              if (canClose()) close();
            }}
          >
            Cancel
          </button>
          <button
            className="button button-accent"
            disabled={busy || !dirty || conflicted}
          >
            {busy ? "Working…" : "Save draft details"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
