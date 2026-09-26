"use client";

import { useContext } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { useResource } from "@/ui/api";
import type { CmsSummary } from "../cms_schemas";
import { EditorLocale } from "./event-collection-editor";
import { useRefreshOnFocus } from "./event-editor-scope";
import { ConnectedSource, ConnectionError } from "./connected-source";

const languageNames = { en: "English", fr: "French", lb: "Luxembourgish" };

export function SectionPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
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
        item.kind === "section" && item.locale === locale && !item.archived,
    ) ?? [];
  const selected = items.find((item) => item.id === value);
  return (
    <div className="editor-connection-picker">
      <ConnectedSource
        name="Reusable sections"
        icon="duplicate"
        description={`This page uses the section's published ${languageNames[locale]} version. Publish changes in the section's own editor to update its placements.`}
        status={
          error
            ? "Connection unavailable"
            : !data
              ? "Loading sections…"
              : selected
                ? selected.publishedRevisionId
                  ? "Published version available"
                  : "Draft only"
                : value
                  ? "Unavailable selection"
                  : "No section selected"
        }
        tone={
          error
            ? "attention"
            : selected?.publishedRevisionId
              ? "ready"
              : value
                ? "attention"
                : "neutral"
        }
        href={
          capabilities.includes("cms.edit")
            ? selected
              ? `/admin/website/${selected.id}?locale=${locale}`
              : `/admin/website?tab=sections&locale=${locale}`
            : undefined
        }
        action={selected ? "Edit reusable section" : "Open reusable sections"}
        onRefresh={refresh}
      />
      <label>
        Reusable section
        <select
          value={value}
          disabled={disabled || !data}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose a section</option>
          {value && !selected && (
            <option value={value}>
              {error
                ? "Saved section — selection retained"
                : data
                  ? "Unavailable section — selection retained"
                  : "Loading selected section…"}
            </option>
          )}
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
              {item.publishedRevisionId ? "" : " — draft"}
            </option>
          ))}
        </select>
      </label>
      {error && <ConnectionError error={error} onRetry={refresh} />}
      {data && !error && !items.length && (
        <p className="field-help">
          No reusable sections in {languageNames[locale]} yet. Create one in
          Website, or add this language to an existing section.
        </p>
      )}
      {selected && (
        <p className="editor-connection-selection">
          <strong>{selected.title}</strong>
          <br />
          {selected.publishedRevisionId
            ? "Its published content appears in the saved preview and on the website."
            : "Publish this section before publishing a page that uses it."}
        </p>
      )}
      {value && data && !selected && !error && (
        <p className="field-help">
          This section is unavailable in {languageNames[locale]}. The saved
          selection is kept until you choose a replacement.
        </p>
      )}
    </div>
  );
}
