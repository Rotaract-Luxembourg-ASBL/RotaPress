"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { z } from "zod";
import { cmsBlockSchema, isSitePart, type CmsDetail } from "../cms_schemas";
import type { Content } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import { useEditorPuck } from "./editor-blocks";
import { editorRootZone } from "./editor-selection";
import {
  copyEditorBlocks,
  editorZoneBlocks,
  moveEditorSelection,
  replaceEditorZone,
  editorGroupingProblem,
  groupEditorSelection,
  ungroupEditorSelection,
} from "./editor-batch-blocks";
import { getBlockMetadata } from "./editor-block-catalogue";
import { request, errorMessage } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { Notice } from "@/ui/primitives";

export function EditorOutline({
  detail,
  disabled,
}: {
  detail: CmsDetail;
  disabled: boolean;
}) {
  const data = useEditorPuck((state) => state.appState.data);
  const dispatch = useEditorPuck((state) => state.dispatch);
  const [zone, setZone] = useState(editorRootZone);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  const [pattern, setPattern] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const outline = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  const zones = [
    { value: editorRootZone, label: "Whole document" },
    ...data.content.flatMap((block, index) =>
      block.type === "Columns" || block.type === "SiteRow"
        ? (block.type === "SiteRow"
            ? ["left", "center", "right"]
            : ["left", "right"]
          ).map((column) => ({
            value: `${block.props.id}:${column}`,
            label: `${getBlockMetadata(block.type).label} ${index + 1} · ${column}`,
          }))
        : [],
    ),
  ];
  const activeZone = zones.some((entry) => entry.value === zone)
    ? zone
    : editorRootZone;
  const blocks = editorZoneBlocks(data.content, activeZone);
  const chosen = blocks.filter((block) => selected.has(block.props.id));
  const locked = disabled || busy;
  const groupingProblem = editorGroupingProblem(blocks, selected, activeZone);
  const canUngroup =
    activeZone === editorRootZone &&
    chosen.some(
      (block) => block.type === "Columns" || block.type === "SiteRow",
    );
  function change(next: Content<PuckBlocks>, nextSelection?: Set<string>) {
    try {
      const content = replaceEditorZone(data.content, activeZone, next);
      dispatch({ type: "setData", data: { ...data, content } });
      dispatch({
        type: "setUi",
        ui: { itemSelector: null },
        recordHistory: false,
      });
      setProblem("");
      setMessage("");
      if (nextSelection) {
        setSelected(nextSelection);
        const first = next.find((block) => nextSelection.has(block.props.id));
        requestAnimationFrame(() => {
          if (first)
            outline.current
              ?.querySelector<HTMLInputElement>(
                `input[data-block-id="${CSS.escape(first.props.id)}"]`,
              )
              ?.focus();
        });
      }
      return true;
    } catch {
      setProblem(
        "This layout would exceed the page or column limit. Keep at most 80 top-level blocks, 120 in total, and 12 in each column.",
      );
      setMessage("");
      return false;
    }
  }
  function group(undo = false) {
    if (locked || (undo ? !canUngroup : groupingProblem)) return;
    try {
      const next = undo
        ? ungroupEditorSelection(blocks, selected)
        : groupEditorSelection(blocks, selected, detail.kind, activeZone);
      if (change(next.content, next.selected))
        setMessage(
          undo
            ? "Blocks ungrouped in reading order. Group styling was removed; block content is preserved."
            : `${chosen.length} blocks grouped. Select the group to style it, or choose its first column to edit the blocks.`,
        );
    } catch (cause) {
      setProblem(errorMessage(cause));
    }
  }
  function shortcut(event: KeyboardEvent<HTMLDivElement>) {
    if (
      locked ||
      (event.target instanceof HTMLElement &&
        (event.target.matches("textarea, select, input:not([type=checkbox])") ||
          event.target.isContentEditable))
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
      event.preventDefault();
      event.stopPropagation();
      group(event.shiftKey);
    } else if (
      event.altKey &&
      ["ArrowUp", "ArrowDown"].includes(event.key) &&
      chosen.length
    ) {
      event.preventDefault();
      change(
        moveEditorSelection(blocks, selected, event.key === "ArrowUp" ? -1 : 1),
      );
    }
  }
  async function clipboard(action: "copy" | "paste") {
    try {
      if (action === "copy") {
        await navigator.clipboard.writeText(
          JSON.stringify({ rotapressBlocks: 1, blocks: chosen }),
        );
        setMessage(`${chosen.length} blocks copied.`);
      } else {
        const copied = z
          .strictObject({
            rotapressBlocks: z.literal(1),
            blocks: z.array(cmsBlockSchema).min(1).max(80),
          })
          .parse(JSON.parse(await navigator.clipboard.readText()));
        if (
          copied.blocks.some((block) =>
            isSitePart(detail.kind)
              ? !block.type.startsWith("Site") &&
                !["Heading", "RichText", "Button", "ClubDetails"].includes(
                  block.type,
                )
              : block.type.startsWith("Site"),
          )
        )
          throw new Error(
            "Paste page blocks into a page and shared layout blocks into the corresponding site part.",
          );
        if (!change([...blocks, ...copyEditorBlocks(copied.blocks)])) return;
        setMessage("Copied blocks inserted at the end of this group.");
      }
      setProblem("");
    } catch (cause) {
      setProblem(
        `Clipboard unavailable or incompatible blocks. ${errorMessage(cause)}`,
      );
    }
  }
  async function savePattern() {
    setBusy(true);
    setProblem("");
    try {
      await request("/api/admin/cms/patterns", {
        method: "POST",
        body: JSON.stringify({
          title,
          locale: detail.locale,
          data: { root: { props: {} }, content: copyEditorBlocks(chosen) },
        }),
      });
      setPattern(false);
      setTitle("");
      setMessage(
        "Section saved as a draft. Insert an independent copy from Saved sections, or publish it for linked placements.",
      );
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="editor-outline-workspace"
      ref={outline}
      onKeyDown={shortcut}
    >
      <label>
        Block group
        <select
          value={activeZone}
          onChange={(event) => {
            setZone(event.target.value);
            setSelected(new Set());
            anchor.current = null;
          }}
          disabled={locked}
        >
          {zones.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <p className="field-help">
        Choose a block to edit, or check several to act on them together.
        Shift-select a range. Use Control/Command+G to group,
        Shift+Control/Command+G to ungroup, and Alt+Up/Down to move selections.
      </p>
      {problem && !pattern && <Notice>{problem}</Notice>}
      {message && (
        <p role="status" className="field-help">
          {message}
        </p>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          disabled={locked || !blocks.length}
          checked={Boolean(blocks.length && chosen.length === blocks.length)}
          onChange={() =>
            setSelected(
              chosen.length === blocks.length
                ? new Set()
                : new Set(blocks.map((block) => block.props.id)),
            )
          }
        />
        Select all in this group
      </label>
      {chosen.length > 0 && groupingProblem && (
        <p className="field-help">{groupingProblem}</p>
      )}
      <div
        className="editor-outline-bulk"
        role="group"
        aria-label="Multiple block actions"
      >
        <span>{chosen.length} selected</span>
        <button
          type="button"
          disabled={locked || Boolean(groupingProblem)}
          onClick={() => group()}
        >
          Group
        </button>
        <button
          type="button"
          disabled={locked || !canUngroup}
          onClick={() => group(true)}
        >
          Ungroup
        </button>
        <button
          type="button"
          disabled={locked || !chosen.length}
          onClick={() => change(moveEditorSelection(blocks, selected, -1))}
        >
          Move up
        </button>
        <button
          type="button"
          disabled={locked || !chosen.length}
          onClick={() => change(moveEditorSelection(blocks, selected, 1))}
        >
          Move down
        </button>
        <button
          type="button"
          disabled={locked || !chosen.length}
          onClick={() =>
            change(
              blocks.flatMap((block) =>
                selected.has(block.props.id)
                  ? [block, ...copyEditorBlocks([block])]
                  : [block],
              ),
            )
          }
        >
          Duplicate
        </button>
        <button
          type="button"
          disabled={locked || !chosen.length}
          onClick={() => {
            change(
              blocks.filter((block) => !selected.has(block.props.id)),
              new Set(),
            );
          }}
        >
          Remove
        </button>
        <button
          type="button"
          disabled={locked || !chosen.length}
          onClick={() => void clipboard("copy")}
        >
          Copy
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => void clipboard("paste")}
        >
          Paste
        </button>
        {!isSitePart(detail.kind) && (
          <button
            type="button"
            disabled={
              locked ||
              !chosen.length ||
              chosen.some((block) => block.type === "SharedSection")
            }
            onClick={() => setPattern(true)}
          >
            Save as section
          </button>
        )}
      </div>
      <ol className="editor-outline-blocks">
        {blocks.map((block, index) => (
          <li key={block.props.id}>
            <input
              type="checkbox"
              data-block-id={block.props.id}
              aria-label={`Select ${index + 1}. ${getBlockMetadata(block.type).label}`}
              checked={selected.has(block.props.id)}
              disabled={locked}
              onChange={(event) => {
                const range =
                  "shiftKey" in event.nativeEvent &&
                  event.nativeEvent.shiftKey === true;
                const start = blocks.findIndex(
                  (entry) => entry.props.id === anchor.current,
                );
                setSelected((current) => {
                  const next = new Set(current);
                  if (range && start >= 0) {
                    for (const entry of blocks.slice(
                      Math.min(start, index),
                      Math.max(start, index) + 1,
                    ))
                      next.add(entry.props.id);
                    return next;
                  }
                  if (next.has(block.props.id)) next.delete(block.props.id);
                  else next.add(block.props.id);
                  return next;
                });
                if (!range) anchor.current = block.props.id;
              }}
            />
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "setUi",
                  ui: { itemSelector: { index, zone: activeZone } },
                  recordHistory: false,
                })
              }
            >
              {index + 1}.{" "}
              {(block.type === "Columns" && block.props.ratio === "stacked") ||
              (block.type === "SiteRow" && block.props.layout === "stacked")
                ? "Group"
                : getBlockMetadata(block.type).label}
            </button>
          </li>
        ))}
      </ol>
      {!blocks.length && (
        <p>No blocks in this group. Add a block or paste copied blocks.</p>
      )}
      {pattern && (
        <Dialog
          title="Save selected blocks as a section"
          onClose={() => setPattern(false)}
          canClose={() => !busy}
        >
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void savePattern();
            }}
          >
            {problem && <Notice>{problem}</Notice>}
            <p>
              Your {chosen.length} selected blocks become a reusable section
              draft. Your current page keeps its independent blocks.
            </p>
            <label>
              Section title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={160}
                disabled={busy}
              />
            </label>
            <button className="button button-accent" disabled={busy}>
              {busy ? "Saving…" : "Save section"}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
