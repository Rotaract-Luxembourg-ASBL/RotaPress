"use client";

import { useContext } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { useResource } from "@/ui/api";
import type { CmsSummary } from "../cms_schemas";
import { EditorLocale } from "./event-collection-editor";
import { useRefreshOnFocus } from "./event-editor-scope";
import { ConnectedSource, ConnectionError } from "./connected-source";

export function PagePicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const locale = useContext(EditorLocale);
  const { capabilities } = useCurrentUser();
  const { data, error, refresh } = useResource<{ items: CmsSummary[] }>(
    "/api/admin/cms/content",
  );
  useRefreshOnFocus(refresh);
  const items =
    data?.items.filter(
      (item) =>
        item.kind === "page" && item.locale === locale && !item.archived,
    ) ?? [];
  const missing = data
    ? value.filter((id) => !items.some((item) => item.id === id))
    : [];
  const drafts = items.filter(
    (item) => value.includes(item.id) && !item.publishedRevisionId,
  );
  return (
    <div className="editor-connection-picker editor-calendar-picker">
      <ConnectedSource
        name="Website pages"
        icon="website"
        description="Cards follow published titles, search descriptions and sharing images in this page's language. Edit that content in each source page; private drafts stay hidden."
        status={
          error
            ? "Connection unavailable"
            : !data
              ? "Loading pages…"
              : `${value.length} selected page${value.length === 1 ? "" : "s"}`
        }
        tone={
          error || missing.length || drafts.length ? "attention" : "neutral"
        }
        href={
          capabilities.includes("cms.edit")
            ? `/admin/website?tab=pages&locale=${locale}`
            : undefined
        }
        action="Open Website pages"
        onRefresh={refresh}
      />
      {error && <ConnectionError error={error} onRetry={refresh} />}
      <fieldset className="calendar-choice-list" disabled={disabled || !data}>
        <legend>Selected pages</legend>
        {items.map((item) => (
          <label className="cms-checkbox" key={item.id}>
            <input
              type="checkbox"
              checked={value.includes(item.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, item.id]
                    : value.filter((id) => id !== item.id),
                )
              }
            />
            {item.title}
            {!item.publishedRevisionId && " (draft)"}
          </label>
        ))}
        {missing.map((id) => (
          <label className="cms-checkbox" key={id}>
            <input
              type="checkbox"
              checked
              onChange={() => onChange(value.filter((item) => item !== id))}
            />
            Unavailable page — uncheck to remove
          </label>
        ))}
        {data && !items.length && (
          <p className="field-help">
            No pages in this language yet. Create a page or add this language in
            Website.
          </p>
        )}
      </fieldset>
      {(missing.length > 0 || drafts.length > 0) && (
        <p className="editor-connection-selection">
          Draft and unavailable pages remain selected, but only published pages
          appear for visitors. Publish their content or remove them from this
          block.
        </p>
      )}
    </div>
  );
}
