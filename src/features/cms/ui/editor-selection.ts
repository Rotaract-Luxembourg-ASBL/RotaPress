import type { Content } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";

export const editorRootZone = "root:default-zone";

export function editorBlockCount(content: Content<PuckBlocks>): number {
  return content.reduce(
    (count, item) =>
      count +
      1 +
      (item.type === "Columns"
        ? item.props.left.length + item.props.right.length
        : item.type === "SiteRow"
          ? item.props.left.length +
            item.props.center.length +
            item.props.right.length
          : 0),
    0,
  );
}

/** The schema permits one level of columns. Keep all selection tools in that scope. */
export function locateEditorBlock(content: Content<PuckBlocks>, id?: string) {
  if (!id) return undefined;
  for (const [index, block] of content.entries()) {
    if (block.props.id === id)
      return { block, index, zone: editorRootZone, siblings: content };
    if (block.type !== "Columns" && block.type !== "SiteRow") continue;
    const columns =
      block.type === "SiteRow"
        ? (["left", "center", "right"] as const)
        : (["left", "right"] as const);
    for (const column of columns) {
      const siblings =
        column === "center" && block.type === "SiteRow"
          ? block.props.center
          : column === "left"
            ? block.props.left
            : block.props.right;
      const childIndex = siblings.findIndex((item) => item.props.id === id);
      if (childIndex >= 0)
        return {
          block: siblings[childIndex],
          index: childIndex,
          zone: `${block.props.id}:${column}`,
          siblings,
          parent: block,
          parentIndex: index,
          column,
        };
    }
  }
  return undefined;
}
