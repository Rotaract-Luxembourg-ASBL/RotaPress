import type { Content } from "@puckeditor/core";
import type { PuckBlocks } from "./puck-config";
import { getBlockMetadata } from "./editor-block-catalogue";

function flatten(content: Content<PuckBlocks>): Content<PuckBlocks> {
  return content.flatMap((block) =>
    block.type === "Columns" || block.type === "SiteRow"
      ? [
          block,
          ...block.props.left,
          ...(block.type === "SiteRow" ? block.props.center : []),
          ...block.props.right,
        ]
      : [block],
  );
}
function description(block: Content<PuckBlocks>[number] | undefined) {
  if (!block) return "Absent";
  const copy: string[] = [];
  const visit = (value: unknown, key?: string) => {
    if (
      [
        "id",
        "version",
        "assetId",
        "design",
        "left",
        "right",
        "center",
      ].includes(key ?? "")
    )
      return;
    if (typeof value === "string" && value)
      copy.push(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
    else if (Array.isArray(value)) value.forEach((item) => visit(item));
    else if (value && typeof value === "object")
      Object.entries(value).forEach(([name, item]) => visit(item, name));
  };
  visit(block.props);
  return copy.join(" · ").slice(0, 500) || "Layout, design or image settings";
}

export function EditorChangeComparison({
  mine,
  latest,
  mineLabel = "Your changes",
  latestLabel = "Saved draft",
}: {
  mine: Content<PuckBlocks>;
  latest: Content<PuckBlocks>;
  mineLabel?: string;
  latestLabel?: string;
}) {
  const own = flatten(mine),
    saved = flatten(latest);
  const ids = [...new Set([...saved, ...own].map((block) => block.props.id))];
  const changes = ids.flatMap((id) => {
    const a = own.find((block) => block.props.id === id),
      b = saved.find((block) => block.props.id === id);
    if (
      JSON.stringify(a) === JSON.stringify(b) &&
      own.indexOf(a!) === saved.indexOf(b!)
    )
      return [];
    const block = a ?? b!;
    return [
      {
        id,
        title: getBlockMetadata(block.type).label,
        change: !b
          ? `Only in ${mineLabel.toLowerCase()}`
          : !a
            ? `Only in ${latestLabel.toLowerCase()}`
            : JSON.stringify(a) === JSON.stringify(b)
              ? "Moved"
              : "Changed",
        mine: description(a),
        latest: description(b),
      },
    ];
  });
  return (
    <section>
      <h3>Block differences</h3>
      {changes.length ? (
        <ul className="editor-change-list">
          {changes.map((change) => (
            <li key={change.id}>
              <strong>
                {change.title} · {change.change}
              </strong>
              <div className="editor-recovery-comparison">
                <p>
                  <b>{mineLabel}:</b> {change.mine}
                </p>
                <p>
                  <b>{latestLabel}:</b> {change.latest}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>Block content and order match. Review the page details above.</p>
      )}
    </section>
  );
}
