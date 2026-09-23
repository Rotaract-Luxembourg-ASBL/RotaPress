import type { CmsSummary } from "@/features/cms/cms_schemas";
import { StatusBadge } from "./collection";

export function contentStatus(item: CmsSummary) {
  if (item.archived) return { key: "archived", label: "Archived" };
  if (!item.publishedRevisionId) return { key: "draft", label: "Draft" };
  return item.draftRevisionId === item.publishedRevisionId
    ? { key: "published", label: "Published" }
    : { key: "changes", label: "Unpublished changes" };
}

export function ContentStatus({ item }: { item: CmsSummary }) {
  const status = contentStatus(item);
  return (
    <StatusBadge
      tone={
        status.key === "published"
          ? "success"
          : status.key === "archived"
            ? "neutral"
            : "warning"
      }
    >
      {status.label}
    </StatusBadge>
  );
}
