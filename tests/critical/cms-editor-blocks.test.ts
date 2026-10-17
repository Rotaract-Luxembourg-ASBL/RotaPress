import { describe, expect, it } from "vitest";
import type { Block } from "../../src/features/cms/cms_schemas";
import {
  copyEditorBlocks,
  moveEditorSelection,
  replaceEditorZone,
  groupEditorSelection,
  ungroupEditorSelection,
} from "../../src/features/cms/ui/editor-batch-blocks";
import { cmsDataSchema } from "../../src/features/cms/cms_schemas";
import { editorRootZone } from "../../src/features/cms/ui/editor-selection";

const heading = (id: string): Block => ({
  type: "Heading",
  props: { id, version: 1, text: id, level: "h2" },
});
describe("editor batch operations", () => {
  it("groups adjacent blocks as a persisted stacked layout and restores their original IDs and order", () => {
    const blocks = ["a", "b", "c", "d"].map(heading);
    const grouped = groupEditorSelection(blocks, new Set(["b", "c"]), "page");
    expect(grouped.content).toHaveLength(3);
    expect(grouped.content[1]).toMatchObject({
      type: "Columns",
      props: {
        ratio: "stacked",
        left: [heading("b"), heading("c")],
        right: [],
      },
    });
    const saved = cmsDataSchema.parse(
      JSON.parse(
        JSON.stringify({ root: { props: {} }, content: grouped.content }),
      ),
    );
    const restored = ungroupEditorSelection(saved.content, grouped.selected);
    expect(restored.content).toEqual(blocks);
    expect([...restored.selected]).toEqual(["b", "c"]);
    expect(blocks.map((block) => block.props.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("groups shared site parts in the native row model and ungroups all columns in reading order", () => {
    const grouped = groupEditorSelection(
      [heading("a"), heading("b")],
      new Set(["a", "b"]),
      "header",
    );
    const saved = cmsDataSchema.parse({
      root: { props: {} },
      content: grouped.content,
    }).content[0];
    expect(saved.type).toBe("SiteRow");
    if (saved.type !== "SiteRow") throw new Error("Expected a site row");
    expect(saved.props.layout).toBe("stacked");
    saved.props.center = [heading("c") as Extract<Block, { type: "Heading" }>];
    saved.props.right = [heading("d") as Extract<Block, { type: "Heading" }>];
    expect(
      ungroupEditorSelection([saved], grouped.selected).content.map(
        (block) => block.props.id,
      ),
    ).toEqual(["a", "b", "c", "d"]);
  });
  it("rejects nonadjacent, oversized and nested groups before changing content", () => {
    const blocks = Array.from({ length: 13 }, (_, index) =>
      heading(String(index)),
    );
    expect(() =>
      groupEditorSelection(blocks, new Set(["0", "2"]), "page"),
    ).toThrow("adjacent");
    expect(() =>
      groupEditorSelection(
        blocks,
        new Set(blocks.map((block) => block.props.id)),
        "page",
      ),
    ).toThrow("12");
    expect(() =>
      groupEditorSelection(blocks, new Set(["0", "1"]), "page", "columns:left"),
    ).toThrow("nested");
    const grouped = groupEditorSelection(
      blocks.slice(0, 2),
      new Set(["0", "1"]),
      "page",
    );
    expect(() =>
      groupEditorSelection(
        [...grouped.content, heading("z")],
        new Set([...grouped.selected, "z"]),
        "page",
      ),
    ).toThrow("Ungroup");
    expect(blocks).toHaveLength(13);
  });
  it("keeps ungrouping atomic when flattening would exceed document limits", () => {
    const blocks = Array.from({ length: 80 }, (_, index) =>
      heading(String(index)),
    );
    const grouped = groupEditorSelection(blocks, new Set(["0", "1"]), "page");
    const full = [...grouped.content, heading("extra")];
    const ungrouped = ungroupEditorSelection(full, grouped.selected);
    expect(() =>
      replaceEditorZone(full, editorRootZone, ungrouped.content),
    ).toThrow();
    expect(full).toHaveLength(80);
    expect(full[0].type).toBe("Columns");
  });
  it("moves discontiguous selections without changing their relative order", () => {
    const blocks = ["a", "b", "c", "d"].map(heading);
    expect(
      moveEditorSelection(blocks, new Set(["b", "d"]), -1).map(
        (block) => block.props.id,
      ),
    ).toEqual(["b", "a", "d", "c"]);
    expect(
      moveEditorSelection(blocks, new Set(["a", "b"]), 1).map(
        (block) => block.props.id,
      ),
    ).toEqual(["c", "a", "b", "d"]);
  });
  it("copies nested identifiers and rejects invalid column insertion atomically", () => {
    const columns: Block = {
      type: "Columns",
      props: {
        id: "columns",
        version: 1,
        ratio: "balanced",
        left: [heading("a") as Extract<Block, { type: "Heading" }>],
        right: [],
      },
    };
    const copied = copyEditorBlocks([columns]);
    expect(copied[0].props.id).not.toBe("columns");
    expect(
      copied[0].type === "Columns" && copied[0].props.left[0].props.id,
    ).not.toBe("a");
    expect(() =>
      replaceEditorZone([columns], "columns:left", [columns]),
    ).toThrow();
    expect(columns.props.left[0].props.id).toBe("a");
  });
});
