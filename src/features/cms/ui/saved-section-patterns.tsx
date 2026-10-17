"use client";
import { useContext, useState } from "react";
import { useResource, request, errorMessage } from "@/ui/api";
import { cmsDataSchema, type CmsDetail, type CmsKind } from "../cms_schemas";
import { useGetPuck, type Content } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import type { PageCollection } from "../cms_workspace_schemas";
import { EditorLocale } from "./event-collection-editor";
import { useEditorPuck } from "./editor-blocks";
import {
  copyEditorBlocks,
  editorZoneBlocks,
  replaceEditorZone,
} from "./editor-batch-blocks";
import { Notice } from "@/ui/primitives";
import { CollectionPagination } from "@/ui/collection-pagination";
import { useCollectionLocation } from "@/ui/collection-location";
import { editorRootZone } from "./editor-selection";

export function SavedSectionPatterns({
  kind,
  zone,
  index,
  disabled,
  onInsert,
}: {
  kind: CmsKind;
  zone: string;
  index: number;
  disabled: boolean;
  onInsert: () => void;
}) {
  const locale = useContext(EditorLocale);
  const location = useCollectionLocation();
  const search = (location.params.get("patternSearch") ?? "").slice(0, 200);
  const rawPage = Number(location.params.get("patternPage"));
  const page =
    Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const open = location.params.get("patterns") === "open";
  const url = `/api/admin/cms/pages?kind=section&collection=all&locale=${locale}&search=${encodeURIComponent(search)}&page=${page}&pageSize=12&sort=title`;
  const [refresh, setRefresh] = useState(0);
  const getPuck = useGetPuck();
  const dispatch = useEditorPuck((state) => state.dispatch);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  async function insert(id: string, linked: boolean) {
    setBusy(true);
    setProblem("");
    try {
      const section = await request<CmsDetail>(
        `/api/admin/cms/content/${id}?locale=${locale}`,
      );
      if (section.archived || section.kind !== "section")
        throw new Error("This section is no longer available. Refresh saved sections and choose another.");
      const incoming: Content<PuckBlocks> = linked
        ? [
            {
              type: "SharedSection",
              props: {
                id: `SharedSection-${crypto.randomUUID()}`,
                version: 1,
                sectionId: id,
              },
            },
          ]
        : copyEditorBlocks(section.draft.data.content);
      const current = getPuck().appState.data;
      const currentContent = cmsDataSchema.shape.content.parse(current.content);
      if (
        zone !== editorRootZone &&
        !currentContent.some(
          (block) =>
            ((block.type === "Columns" || block.type === "SiteRow") &&
              [`${block.props.id}:left`, `${block.props.id}:right`].includes(
                zone,
              )) ||
            (block.type === "SiteRow" && `${block.props.id}:center` === zone),
        )
      )
        throw new Error(
          "The insertion group was removed. Choose another insertion point.",
        );
      const siblings = [...editorZoneBlocks(currentContent, zone)];
      const destination = Math.min(index, siblings.length);
      siblings.splice(destination, 0, ...incoming);
      const content = replaceEditorZone(currentContent, zone, siblings);
      dispatch({ type: "setData", data: { ...current, content } });
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: destination, zone } },
        recordHistory: false,
      });
      onInsert();
    } catch (cause) {
      setProblem(`Section could not be inserted. ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="editor-patterns"
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open !== open)
          location.change(
            { patterns: event.currentTarget.open ? "open" : undefined },
            false,
          );
      }}
    >
      <summary>Saved sections</summary>
      <p className="field-help">
        A linked section follows its published version everywhere. An
        independent copy starts from its saved draft.
      </p>
      <label>
        Find a section
        <input
          type="search"
          value={search}
          maxLength={200}
          disabled={busy}
          onChange={(event) =>
            location.change(
              { patternSearch: event.target.value, patternPage: undefined },
              false,
            )
          }
        />
      </label>
      {problem && <Notice>{problem}</Notice>}
      <button
        type="button"
        className="inline-button"
        disabled={busy}
        onClick={() => setRefresh((value) => value + 1)}
      >
        Refresh saved sections
      </button>
      {busy && <p role="status">Inserting section…</p>}
      {open && (
        <SavedSectionResults
          key={`${url}:${refresh}`}
          url={url}
          kind={kind}
          disabled={disabled || busy}
          insert={insert}
          page={(value) =>
            location.change(
              { patternPage: value > 1 ? value : undefined },
              false,
            )
          }
        />
      )}
    </details>
  );
}

function SavedSectionResults({
  url,
  kind,
  disabled,
  insert,
  page,
}: {
  url: string;
  kind: CmsKind;
  disabled: boolean;
  insert: (id: string, linked: boolean) => Promise<void>;
  page: (value: number) => void;
}) {
  // Keyed by the exact query: never show rows or totals from a previous search/page.
  const { data: sections, error, refresh } = useResource<PageCollection>(url);
  return (
    <div aria-busy={!sections && !error}>
      {error && (
        <Notice>
          {error}{" "}
          <button type="button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {!sections && !error && <p role="status">Loading saved sections…</p>}
      {sections?.items.map((section) => (
        <article className="editor-saved-pattern" key={section.id}>
          <strong>{section.title}</strong>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void insert(section.id, false)}
          >
            Insert independent copy
          </button>
          {kind !== "section" && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void insert(section.id, true)}
            >
              Insert linked section
            </button>
          )}
        </article>
      ))}
      {sections && !sections.items.length && (
        <p>
          No matching saved sections. Select blocks in List view and choose Save
          as section.
        </p>
      )}
      {sections && (
        <fieldset disabled={disabled} className="editor-fieldset">
          <CollectionPagination
            page={sections.page}
            pageSize={sections.pageSize}
            total={sections.total}
            onPage={page}
            noun="saved sections"
          />
        </fieldset>
      )}
    </div>
  );
}
