"use client";

import { createUsePuck, type Content } from "@puckeditor/core";
import { useState } from "react";
import { puckConfig, type PuckBlocks } from "./puck-config";
import { Icon as EditorIcon } from "@/ui/icon";
import { isSitePart, sitePartBlockTypes, type CmsKind } from "../cms_schemas";
import { useCurrentUser } from "@/ui/admin-shell";
import { PatternPicker } from "../kits/ui/pattern-picker";
import { eventOnlyBlockTypes } from "../../events/event_content";
import {
  getBlockMetadata,
  type BlockLibraryGroup,
} from "./editor-block-catalogue";

export const useEditorPuck = createUsePuck<typeof puckConfig>();
const rootZone = "root:default-zone";
const libraryGroups = [
  { id: "all", label: "All blocks" },
  { id: "content", label: "Content" },
  { id: "layout", label: "Layout" },
  { id: "connected", label: "Connected" },
] as const;

export function BlockLibrary({
  onInsert,
  insertionIndex,
  insertionZone,
  disabled = false,
  kind,
}: {
  onInsert: () => void;
  insertionIndex: number | null;
  insertionZone?: string;
  disabled?: boolean;
  kind: CmsKind;
}) {
  const { features } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<BlockLibraryGroup | "all">("all");
  const dispatch = useEditorPuck((state) => state.dispatch);
  const content = useEditorPuck((state) => state.appState.data.content);
  const selection = useEditorPuck((state) => state.appState.ui.itemSelector);
  const requestedZone = insertionZone ?? selection?.zone ?? rootZone;
  const requestKey = `${requestedZone}:${insertionIndex ?? "end"}`;
  const [placement, setPlacement] = useState<{
    requestKey: string;
    zone: string;
    index: number | null;
  } | null>(null);
  const zoneOptions = [
    {
      value: rootZone,
      label: isSitePart(kind)
        ? "Whole site part"
        : kind === "section"
          ? "Whole section"
          : "Whole page",
    },
    ...content.flatMap((item, index) =>
      item.type === "SiteRow" || item.type === "Columns"
        ? (item.type === "SiteRow"
            ? ["left", "center", "right"]
            : ["left", "right"]
          ).map((column) => ({
            value: `${item.props.id}:${column}`,
            label: `${getBlockMetadata(item.type).label} ${index + 1} · ${column} column`,
          }))
        : [],
    ),
  ];
  const requestedPlacement =
    placement?.requestKey === requestKey
      ? placement
      : { zone: requestedZone, index: insertionIndex };
  const zone = zoneOptions.some(
    (option) => option.value === requestedPlacement.zone,
  )
    ? requestedPlacement.zone
    : rootZone;
  const blocksInZone = zoneBlocks(content, zone);
  const insertionPosition =
    zone === requestedPlacement.zone ? requestedPlacement.index : null;
  const destination = Math.max(
    0,
    Math.min(insertionPosition ?? blocksInZone.length, blocksInZone.length),
  );
  const precedingBlock = blocksInZone[destination - 1];
  const positionSummary = `${zoneOptions.find((option) => option.value === zone)?.label} · ${
    precedingBlock
      ? `After ${destination}. ${getBlockMetadata(precedingBlock.type).label}`
      : "At the beginning"
  }`;
  const categories = Object.entries(puckConfig.categories ?? {}).map(
    ([key, category]) => ({
      key,
      title: category.title,
      blocks: (category.components ?? []).filter(
        (name) =>
          (name !== "Form" || features.forms) &&
          !eventOnlyBlockTypes.some((type) => type === name) &&
          (name !== "EventCollection" || features.events) &&
          (name !== "ProjectCollection" || features.projects) &&
          (name !== "Calendar" || features.calendar) &&
          (zone === rootZone || name !== "Columns") &&
          (isSitePart(kind)
            ? sitePartBlockTypes.some((type) => type === name) &&
              (zone === rootZone || name !== "SiteRow")
            : !name.startsWith("Site")),
      ),
    }),
  );
  const availableBlocks = categories.flatMap((category) => category.blocks);
  const search = query.trim().toLowerCase();
  const matchesSearch = (name: keyof PuckBlocks) => {
    const metadata = getBlockMetadata(name);
    return `${name} ${metadata.label} ${metadata.description} ${metadata.sourceLabel ?? ""}`
      .toLowerCase()
      .includes(search);
  };
  const visibleCategories = categories.map((category) => ({
    ...category,
    blocks: category.blocks.filter(
      (name) =>
        (group === "all" || getBlockMetadata(name).group === group) &&
        matchesSearch(name),
    ),
  }));
  const resultCount = visibleCategories.reduce(
    (count, category) => count + category.blocks.length,
    0,
  );
  return (
    <div className="editor-block-library">
      <label className="editor-block-search">
        Search blocks
        <input
          type="search"
          value={query}
          placeholder="Text, images, forms, calendars…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div
        className="editor-library-filters"
        role="group"
        aria-label="Block categories"
      >
        {libraryGroups.map((item) => (
          <button
            type="button"
            className="editor-library-filter"
            key={item.id}
            aria-pressed={group === item.id}
            onClick={() => setGroup(item.id)}
          >
            {item.label}
            <span>
              {
                availableBlocks.filter(
                  (name) =>
                    (item.id === "all" ||
                      getBlockMetadata(name).group === item.id) &&
                    matchesSearch(name),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      {group === "connected" && (
        <p className="editor-help">
          Display content managed in your other workspaces.
        </p>
      )}
      <details className="editor-insertion-context">
        <summary
          aria-label="Insertion position"
          aria-describedby="editor-insertion-position-summary"
        >
          <span id="editor-insertion-position-summary">{positionSummary}</span>
        </summary>
        {zoneOptions.length > 1 && (
          <label className="editor-block-search">
            Insert into
            <select
              value={zone}
              onChange={(event) =>
                setPlacement({
                  requestKey,
                  zone: event.target.value,
                  index: null,
                })
              }
            >
              {zoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="editor-block-search">
          Block position
          <select
            value={destination}
            onChange={(event) =>
              setPlacement({
                requestKey,
                zone,
                index: Number(event.target.value),
              })
            }
          >
            <option value={0}>
              {blocksInZone.length ? "At the beginning" : "First block"}
            </option>
            {blocksInZone.map((item, index) => (
              <option key={item.props.id} value={index + 1}>
                After {index + 1}. {getBlockMetadata(item.type).label}
              </option>
            ))}
          </select>
        </label>
      </details>
      {zone === rootZone && !search && group === "all" && (
        <PatternPicker
          kind={kind}
          index={destination}
          disabled={disabled}
          onInsert={onInsert}
        />
      )}
      <p className="editor-library-result-count" role="status">
        {resultCount} {resultCount === 1 ? "block" : "blocks"}
        {search ? " matching your search" : " available"}
      </p>
      {resultCount === 0 && (
        <div className="editor-library-empty">
          <EditorIcon name="search" />
          <h3>No blocks found</h3>
          <p>Try a different word or browse all available blocks.</p>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setQuery("");
              setGroup("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {visibleCategories.map(
        (category) =>
          category.blocks.length > 0 && (
            <section key={category.key}>
              <h3>{category.title}</h3>
              <div className="editor-block-list">
                {category.blocks.map((name) => {
                  const metadata = getBlockMetadata(name);
                  return (
                    <button
                      type="button"
                      key={name}
                      disabled={disabled}
                      aria-label={`Add ${metadata.label} block`}
                      onClick={() => {
                        if (disabled) return;
                        dispatch({
                          type: "insert",
                          componentType: name,
                          destinationIndex: destination,
                          destinationZone: zone,
                        });
                        dispatch({
                          type: "setUi",
                          ui: {
                            itemSelector: { index: destination, zone },
                          },
                          recordHistory: false,
                        });
                        onInsert();
                      }}
                    >
                      <span className="editor-block-symbol">
                        <EditorIcon name={metadata.icon} />
                      </span>
                      <span className="editor-block-copy">
                        <strong>{metadata.label}</strong>
                        <small>{metadata.description}</small>
                        {metadata.sourceLabel && (
                          <span className="editor-block-source">
                            From {metadata.sourceLabel}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ),
      )}
    </div>
  );
}

export function BlockActions({ disabled = false }: { disabled?: boolean }) {
  const selected = useEditorPuck((state) => state.appState.ui.itemSelector);
  const count = useEditorPuck(
    (state) =>
      zoneBlocks(
        state.appState.data.content,
        state.appState.ui.itemSelector?.zone ?? rootZone,
      ).length,
  );
  const dispatch = useEditorPuck((state) => state.dispatch);
  if (!selected) return null;
  const zone = selected.zone ?? rootZone;
  function move(offset: number) {
    if (!selected || disabled) return;
    const destinationIndex = selected.index + offset;
    dispatch({
      type: "reorder",
      sourceIndex: selected.index,
      destinationIndex,
      destinationZone: zone,
    });
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: destinationIndex, zone } },
      recordHistory: false,
    });
  }
  return (
    <div
      className="editor-block-actions"
      role="group"
      aria-label="Selected block actions"
    >
      <button
        className="editor-icon-button"
        title="Move up"
        aria-label="Move block up"
        disabled={disabled || selected.index === 0}
        onClick={() => move(-1)}
      >
        <EditorIcon name="up" />
      </button>
      <button
        className="editor-icon-button"
        title="Move down"
        aria-label="Move block down"
        disabled={disabled || selected.index >= count - 1}
        onClick={() => move(1)}
      >
        <EditorIcon name="down" />
      </button>
      <button
        className="editor-icon-button"
        title="Duplicate block"
        aria-label="Duplicate block"
        disabled={disabled}
        onClick={() =>
          dispatch({
            type: "duplicate",
            sourceIndex: selected.index,
            sourceZone: zone,
          })
        }
      >
        <EditorIcon name="duplicate" />
      </button>
      <button
        className="editor-icon-button editor-danger"
        title="Remove block"
        aria-label="Remove block"
        disabled={disabled}
        onClick={() =>
          dispatch({ type: "remove", index: selected.index, zone })
        }
      >
        <EditorIcon name="trash" />
      </button>
    </div>
  );
}

function zoneBlocks(
  content: Content<PuckBlocks>,
  zone: string,
): Content<PuckBlocks> {
  if (zone === rootZone) return content;
  const [id, column] = zone.split(":");
  const row = content.find((item) => item.props.id === id);
  if (row?.type === "Columns" && (column === "left" || column === "right"))
    return row.props[column];
  return row?.type === "SiteRow" &&
    (column === "left" || column === "center" || column === "right")
    ? row.props[column]
    : [];
}
