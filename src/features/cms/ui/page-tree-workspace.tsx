"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { CmsLocale } from "../cms_schemas";
import type { PageCollection, PageRow } from "../cms_workspace_schemas";
import { request, errorMessage, useResource } from "@/ui/api";
import { useCollectionLocation } from "@/ui/collection-location";
import { ContentStatus } from "@/ui/content-status";
import { Loading, Notice } from "@/ui/primitives";

type Destination = {
  parentId: string | null;
  before: PageRow | null;
  label: string;
};
type TreeState = {
  locale: CmsLocale;
  expanded: Set<string>;
  pages: Map<string, number>;
  moving: PageRow | undefined;
  busy: boolean;
  returnTo: string;
  canLeave: () => boolean;
  toggle: (id: string) => void;
  page: (parentId: string, page: number) => void;
  choose: (row: PageRow) => void;
  place: (destination: Destination) => void;
  drag: (row: PageRow) => void;
  drop: (destination: Destination) => void;
};

function query(locale: CmsLocale, values: Record<string, string>) {
  return `/api/admin/cms/pages?${new URLSearchParams({
    locale,
    kind: "page",
    collection: "all",
    status: "all",
    sort: "order",
    pageSize: "25",
    ...values,
  })}`;
}

/** Each expanded sibling group loads its own bounded, authorized page. */
export function PageTreeWorkspace({
  locale,
  canLeave,
}: {
  locale: CmsLocale;
  canLeave: () => boolean;
}) {
  const location = useCollectionLocation();
  const expanded = new Set(
    (location.params.get("treeOpen") ?? "").split(",").filter(Boolean),
  );
  const pages = new Map(
    (location.params.get("treePages") ?? "").split(",").flatMap((entry) => {
      const [id, value] = entry.split(":");
      const page = Number(value);
      return id && Number.isInteger(page) && page > 0 && page <= 100000
        ? [[id, page] as const]
        : [];
    }),
  );
  const [moving, setMoving] = useState<PageRow>();
  const [destination, setDestination] = useState<Destination>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const dragSource = useRef<PageRow | undefined>(undefined);
  function choose(row: PageRow) {
    setMoving(row);
    setDestination(undefined);
    setProblem("");
    setMessage("");
  }
  function place(next: Destination) {
    setDestination(next);
    setProblem("");
  }
  async function move() {
    if (!moving || !destination || busy) return;
    setBusy(true);
    setProblem("");
    try {
      await request(`/api/admin/cms/content/${moving.id}/move`, {
        method: "POST",
        body: JSON.stringify({
          locale,
          expectedRevisionId: moving.draftRevisionId,
          expectedPlacementVersion: moving.placementVersion,
          parentId: destination.parentId,
          beforeId: destination.before?.id ?? null,
          ...(destination.before
            ? { expectedBeforeVersion: destination.before.placementVersion }
            : {}),
        }),
      });
      setMessage(
        `“${moving.title}” moved ${destination.label}. Page addresses are unchanged.`,
      );
      if (destination.parentId) {
        const nextExpanded = new Set(expanded).add(destination.parentId);
        location.change({ treeOpen: [...nextExpanded].join(",") }, false);
      }
      setMoving(undefined);
      setDestination(undefined);
      setRevision((value) => value + 1);
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function refreshChoice() {
    if (!moving || busy) return;
    setBusy(true);
    try {
      const ids = [
        ...new Set(
          [moving.id, destination?.before?.id].filter((id): id is string =>
            Boolean(id),
          ),
        ),
      ];
      const results = await Promise.all(
        ids.map(async (id) => {
          const result = await request<PageCollection>(
            query(locale, { id, pageSize: "1" }),
          );
          const row = result.items.find((item) => item.id === id);
          if (!row)
            throw new Error(
              "A selected page is no longer active. Cancel this move and choose an available page.",
            );
          return row;
        }),
      );
      setMoving(results.find((row) => row.id === moving.id));
      if (destination?.before) {
        const before = results.find(
          (row) => row.id === destination.before!.id,
        )!;
        setDestination({
          parentId: before.parentId,
          before,
          label: `before “${before.title}”`,
        });
      }
      setRevision((value) => value + 1);
      setProblem("");
      setMessage(
        "Page versions refreshed. Your destination is kept; review the tree and choose Move page to retry.",
      );
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  const state: TreeState = {
    locale,
    expanded,
    pages,
    moving,
    busy,
    canLeave,
    returnTo: `/admin/website?${location.params}`,
    toggle: (id) => {
      const nextExpanded = new Set(expanded);
      if (nextExpanded.has(id)) nextExpanded.delete(id);
      else nextExpanded.add(id);
      location.change({ treeOpen: [...nextExpanded].join(",") }, false);
    },
    page: (id, page) => {
      const nextPages = new Map(pages);
      if (page === 1) nextPages.delete(id);
      else nextPages.set(id, page);
      location.change(
        {
          treePages: [...nextPages]
            .map(([key, value]) => `${key}:${value}`)
            .join(","),
        },
        false,
      );
    },
    choose,
    place,
    drag: (row) => {
      dragSource.current = row;
      choose(row);
    },
    drop: (next) => {
      if (!dragSource.current || busy) return;
      setMoving(dragSource.current);
      place(next);
      dragSource.current = undefined;
    },
  };
  return (
    <section className="page-tree-workspace" aria-label="Page hierarchy">
      <p className="field-help">
        All active pages are shown in their saved order. Expand a page to browse
        its children. Choose Move, then a destination; you can also drag a Move
        handle onto a destination. List filters are kept when you return to List
        view.
      </p>
      {message && <Notice kind="success">{message}</Notice>}
      <div className="page-tree-move-toolbar" aria-label="Page order controls">
        {moving ? (
          <>
            <strong>Moving: {moving.title}</strong>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={busy}
              onClick={() =>
                place({
                  parentId: null,
                  before: null,
                  label: "to the end of the top level",
                })
              }
            >
              Top level, at end
            </button>
            <button
              type="button"
              className="button button-outline button-small"
              disabled={busy}
              onClick={() =>
                place({
                  parentId: moving.parentId,
                  before: null,
                  label: "to the end of its current group",
                })
              }
            >
              End of current group
            </button>
            <span role="status">
              {destination
                ? `Destination: ${destination.label}`
                : "Choose a destination below."}
            </span>
            <button
              type="button"
              className="button button-accent button-small"
              disabled={busy || !destination}
              onClick={() => void move()}
            >
              {busy ? "Working…" : "Move page"}
            </button>
            <button
              type="button"
              className="inline-button"
              disabled={busy}
              onClick={() => {
                setMoving(undefined);
                setDestination(undefined);
                setProblem("");
              }}
            >
              Cancel move
            </button>
          </>
        ) : (
          <span>
            Use a page's Move button to change its parent or order. Moving keeps
            public URLs and menus unchanged.
          </span>
        )}
      </div>
      {problem && (
        <Notice>
          {problem} Your choice is kept.{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshChoice()}
          >
            Refresh selected pages
          </button>
        </Notice>
      )}
      <PageSiblingGroup
        key={`${locale}:${revision}:${pages.get("root") ?? 1}`}
        parentId={null}
        parentTitle="Top-level pages"
        ancestors={[]}
        state={state}
      />
    </section>
  );
}

function PageSiblingGroup({
  parentId,
  parentTitle,
  ancestors,
  state,
}: {
  parentId: string | null;
  parentTitle: string;
  ancestors: string[];
  state: TreeState;
}) {
  const page = state.pages.get(parentId ?? "root") ?? 1;
  const { data, error, refresh } = useResource<PageCollection>(
    query(state.locale, { parentId: parentId ?? "root", page: String(page) }),
  );
  return (
    <div className="page-tree-group">
      {error && (
        <Notice>
          {error}{" "}
          <button type="button" onClick={refresh}>
            Reload {parentTitle}
          </button>
        </Notice>
      )}
      {!data && !error && <Loading />}
      {data && (
        <>
          <ul
            className="page-tree-rows"
            aria-label={parentId ? `Children of ${parentTitle}` : parentTitle}
          >
            {data.items.map((row) => {
              const expanded = state.expanded.has(row.id);
              const invalidDestination =
                row.id === state.moving?.id ||
                ancestors.includes(state.moving?.id ?? "");
              const before: Destination = {
                parentId: row.parentId,
                before: row,
                label: `before “${row.title}”${row.parentId && !row.parentTitle ? " (under its parent in another language)" : ""}`,
              };
              const inside: Destination = {
                parentId: row.id,
                before: null,
                label: `inside “${row.title}”, at the end`,
              };
              return (
                <li key={row.id}>
                  <div
                    className="page-tree-row"
                    data-moving={row.id === state.moving?.id || undefined}
                    style={{
                      paddingInlineStart:
                        12 + Math.min(ancestors.length, 4) * 12,
                    }}
                  >
                    <button
                      type="button"
                      className="page-tree-disclosure"
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${row.title}`}
                      aria-expanded={expanded}
                      disabled={!row.childCount || state.busy}
                      onClick={() => state.toggle(row.id)}
                    >
                      {row.childCount ? (expanded ? "−" : "+") : "·"}
                    </button>
                    <div className="page-tree-identity">
                      <Link
                        href={`/admin/website/${row.id}?locale=${state.locale}&returnTo=${encodeURIComponent(state.returnTo)}`}
                        onNavigate={(event) => {
                          if (!state.canLeave()) event.preventDefault();
                        }}
                      >
                        {row.title}
                      </Link>
                      <span className="small muted">
                        /pages/{state.locale}/{row.slug}
                        {row.parentId && !row.parentTitle
                          ? " · Parent has no translation in this language"
                          : ""}
                        {row.childCount
                          ? ` · ${row.childCount} child ${row.childCount === 1 ? "page" : "pages"}`
                          : ""}
                      </span>
                    </div>
                    <ContentStatus item={row} />
                    <button
                      type="button"
                      className="button button-outline button-small"
                      aria-label={`Move ${row.title}`}
                      disabled={state.busy}
                      draggable={!state.busy}
                      onDragStart={(event) => {
                        state.drag(row);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", row.id);
                      }}
                      onClick={() => state.choose(row)}
                    >
                      Move
                    </button>
                    {state.moving && (
                      <div className="page-tree-destinations">
                        <button
                          type="button"
                          disabled={state.busy || invalidDestination}
                          onDragOver={(event) => {
                            if (!invalidDestination && !state.busy)
                              event.preventDefault();
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (!invalidDestination) state.drop(before);
                          }}
                          onClick={() => state.place(before)}
                          aria-label={`Place before ${row.title}`}
                        >
                          Before
                        </button>
                        <button
                          type="button"
                          disabled={state.busy || invalidDestination}
                          onDragOver={(event) => {
                            if (!invalidDestination && !state.busy)
                              event.preventDefault();
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (!invalidDestination) state.drop(inside);
                          }}
                          onClick={() => state.place(inside)}
                          aria-label={`Place inside ${row.title}`}
                        >
                          Inside, at end
                        </button>
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <PageSiblingGroup
                      key={`${row.id}:${state.pages.get(row.id) ?? 1}`}
                      parentId={row.id}
                      parentTitle={row.title}
                      ancestors={[...ancestors, row.id]}
                      state={state}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {!data.items.length && (
            <p className="page-tree-empty">
              No active {parentId ? "child pages" : "pages"} in this group.
            </p>
          )}
          {data.total > data.pageSize && (
            <nav
              className="page-tree-pagination"
              aria-label={`${parentTitle} pages`}
            >
              <span>
                {data.total} pages · Page {data.page} of{" "}
                {Math.ceil(data.total / data.pageSize)}
              </span>
              <button
                type="button"
                disabled={state.busy || data.page <= 1}
                onClick={() => state.page(parentId ?? "root", data.page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={state.busy || data.page * data.pageSize >= data.total}
                onClick={() => state.page(parentId ?? "root", data.page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
