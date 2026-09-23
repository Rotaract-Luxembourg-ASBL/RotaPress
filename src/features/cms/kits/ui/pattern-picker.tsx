"use client";
import { sectionPatterns } from "../section_patterns";
import { createUsePuck } from "@puckeditor/core";
import type { puckConfig } from "../../ui/puck-config";
import { useCurrentUser } from "@/ui/admin-shell";
import { isSitePart, type CmsKind } from "../../cms_schemas";
const useEditorPuck = createUsePuck<typeof puckConfig>();

export function PatternPicker({
  kind,
  index,
  disabled,
  onInsert,
}: {
  kind: CmsKind;
  index: number;
  disabled: boolean;
  onInsert: () => void;
}) {
  const dispatch = useEditorPuck((state) => state.dispatch);
  const data = useEditorPuck((state) => state.appState.data);
  const { features } = useCurrentUser();
  return (
    <details className="editor-patterns">
      <summary>Ready section patterns</summary>
      <div className="editor-block-list">
        {sectionPatterns
          .filter((pattern) =>
            isSitePart(kind)
              ? pattern.id === "footer"
              : pattern.id !== "footer" &&
                (pattern.id !== "activities" || features.events) &&
                (pattern.id !== "calendar" || features.calendar) &&
                (pattern.id !== "contact" || features.forms),
          )
          .map((pattern) => (
            <button
              type="button"
              key={pattern.id}
              disabled={disabled}
              onClick={() => {
                const content = [...data.content];
                content.splice(index, 0, pattern.create());
                dispatch({ type: "setData", data: { ...data, content } });
                dispatch({
                  type: "setUi",
                  ui: { itemSelector: { index, zone: "root:default-zone" } },
                  recordHistory: false,
                });
                onInsert();
              }}
            >
              <span>
                <span className="kit-pattern-thumb" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <strong>{pattern.name}</strong>
                <small>{pattern.description}</small>
              </span>
            </button>
          ))}
      </div>
    </details>
  );
}
