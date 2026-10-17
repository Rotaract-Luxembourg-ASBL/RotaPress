import type { Content } from "@puckeditor/core";
import {
  cmsDataSchema,
  cmsLeafBlockSchema,
  isSitePart,
  type CmsKind,
} from "../cms_schemas";
import type { PuckBlocks } from "./puck-config";
import { editorRootZone } from "./editor-selection";

export function copyEditorBlocks(
  blocks: Content<PuckBlocks>,
): Content<PuckBlocks> {
  return blocks.map((block) => {
    const copied = structuredClone(block);
    copied.props.id = `${block.type}-${crypto.randomUUID()}`;
    if (copied.type === "Columns" || copied.type === "SiteRow") {
      copied.props.left = copyEditorBlocks(copied.props.left);
      copied.props.right = copyEditorBlocks(copied.props.right);
      if (copied.type === "SiteRow")
        copied.props.center = copyEditorBlocks(copied.props.center);
    }
    return copied;
  });
}

export function editorZoneBlocks(
  content: Content<PuckBlocks>,
  zone: string,
): Content<PuckBlocks> {
  if (zone === editorRootZone) return content;
  const [id, column] = zone.split(":");
  const parent = content.find((block) => block.props.id === id);
  if (
    (parent?.type === "Columns" || parent?.type === "SiteRow") &&
    (column === "left" || column === "right")
  )
    return parent.props[column];
  return parent?.type === "SiteRow" && column === "center"
    ? parent.props.center
    : [];
}

export function replaceEditorZone(
  content: Content<PuckBlocks>,
  zone: string,
  blocks: Content<PuckBlocks>,
): Content<PuckBlocks> {
  const [id, column] = zone.split(":");
  const result =
    zone === editorRootZone
      ? blocks
      : content.map((block) =>
          block.props.id === id &&
          (block.type === "Columns" || block.type === "SiteRow")
            ? { ...block, props: { ...block.props, [column]: blocks } }
            : block,
        );
  return cmsDataSchema.parse({ root: { props: {} }, content: result }).content;
}

export function moveEditorSelection(
  blocks: Content<PuckBlocks>,
  selected: Set<string>,
  offset: -1 | 1,
): Content<PuckBlocks> {
  const result = [...blocks];
  const order =
    offset === -1
      ? result.map((_, index) => index)
      : result.map((_, index) => index).reverse();
  for (const index of order) {
    const next = index + offset;
    if (
      !selected.has(result[index].props.id) ||
      next < 0 ||
      next >= result.length ||
      selected.has(result[next].props.id)
    )
      continue;
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

/** Group only adjacent leaf blocks: preserve reading order and the existing one-level model. */
export function editorGroupingProblem(
  blocks: Content<PuckBlocks>,
  selected: Set<string>,
  zone: string,
) {
  const indexes = blocks.flatMap((block, index) =>
    selected.has(block.props.id) ? [index] : [],
  );
  if (zone !== editorRootZone)
    return "Groups cannot be nested. Select blocks in Whole document.";
  if (indexes.length < 2)
    return "Select at least two adjacent blocks to group.";
  if (indexes.length > 12) return "A group can contain up to 12 blocks.";
  if (indexes.at(-1)! - indexes[0] + 1 !== indexes.length)
    return "Select adjacent blocks to keep their reading order.";
  if (
    indexes.some((index) => ["Columns", "SiteRow"].includes(blocks[index].type))
  )
    return "Ungroup existing layouts before adding them to another group.";
  return null;
}

export function groupEditorSelection(
  blocks: Content<PuckBlocks>,
  selected: Set<string>,
  kind: CmsKind,
  zone = editorRootZone,
) {
  const problem = editorGroupingProblem(blocks, selected, zone);
  if (problem) throw new Error(problem);
  const first = blocks.findIndex((block) => selected.has(block.props.id));
  const left = blocks
    .filter((block) => selected.has(block.props.id))
    .map((block) => cmsLeafBlockSchema.parse(block));
  const id = `Group-${crypto.randomUUID()}`;
  const group = isSitePart(kind)
    ? {
        type: "SiteRow" as const,
        props: {
          id,
          version: 1 as const,
          layout: "stacked" as const,
          flow: "columns" as const,
          spacing: "comfortable" as const,
          left,
          center: [],
          right: [],
        },
      }
    : {
        type: "Columns" as const,
        props: {
          id,
          version: 1 as const,
          ratio: "stacked" as const,
          left,
          right: [],
        },
      };
  const content = [...blocks];
  content.splice(first, left.length, group);
  return { content, selected: new Set([id]) };
}

export function ungroupEditorSelection(
  blocks: Content<PuckBlocks>,
  selected: Set<string>,
) {
  const restored = new Set<string>();
  const content = blocks.flatMap((block) => {
    if (!selected.has(block.props.id)) return [block];
    if (block.type !== "Columns" && block.type !== "SiteRow") {
      restored.add(block.props.id);
      return [block];
    }
    const children = [
      ...block.props.left,
      ...(block.type === "SiteRow" ? block.props.center : []),
      ...block.props.right,
    ];
    for (const child of children) restored.add(child.props.id);
    return children;
  });
  return { content, selected: restored };
}
