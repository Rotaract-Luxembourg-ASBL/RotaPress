"use client";

import { Puck } from "@puckeditor/core";
import { useState, type KeyboardEvent } from "react";
import type { EditorDocument } from "./use-editor-document";
import { Icon as EditorIcon } from "@/ui/icon";
import { BlockActions, useEditorPuck } from "./editor-blocks";
import { PageSettings } from "./editor-panels";
import { isSitePart } from "../cms_schemas";
import { BlockDesignPanel } from "./block-design-panel";
import { getBlockMetadata } from "./editor-block-catalogue";
import { editorRootZone, locateEditorBlock } from "./editor-selection";

/** Tabs follow the keyboard convention without moving focus into edited content. */
function tabKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  );
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next]?.click();
  tabs[next]?.focus();
}

export function EditorInspector({
  document: doc,
  close,
  tab,
  setTab,
}: {
  document: EditorDocument;
  close: () => void;
  tab: "page" | "block";
  setTab: (tab: "page" | "block") => void;
}) {
  const selected = useEditorPuck((state) => state.selectedItem);
  const content = useEditorPuck((state) => state.appState.data.content);
  const dispatch = useEditorPuck((state) => state.dispatch);
  const location = locateEditorBlock(content, selected?.props.id);
  const metadata = selected ? getBlockMetadata(selected.type) : null;
  const [blockTab, setBlockTab] = useState<"content" | "design">("content");
  return (
    <>
      <div
        className="editor-inspector-tabs"
        role="tablist"
        aria-label="Inspector"
        onKeyDown={tabKeys}
      >
        <button
          id="editor-page-tab"
          role="tab"
          aria-selected={tab === "page"}
          aria-controls="editor-page-panel"
          tabIndex={tab === "page" ? 0 : -1}
          onClick={() => setTab("page")}
        >
          {isSitePart(doc.detail.kind) ? "Site part" : "Page"}
        </button>
        <button
          id="editor-block-tab"
          role="tab"
          aria-selected={tab === "block"}
          aria-controls="editor-block-panel"
          tabIndex={tab === "block" ? 0 : -1}
          onClick={() => setTab("block")}
        >
          Block
        </button>
        <button
          className="editor-icon-button"
          aria-label="Close settings"
          title="Close settings"
          onClick={close}
        >
          <EditorIcon name="close" />
        </button>
      </div>
      <div
        id="editor-page-panel"
        role="tabpanel"
        aria-labelledby="editor-page-tab"
        hidden={tab !== "page"}
      >
        <PageSettings document={doc} />
      </div>
      <div
        id="editor-block-panel"
        role="tabpanel"
        aria-labelledby="editor-block-tab"
        hidden={tab !== "block"}
      >
        {selected && metadata ? (
          <>
            <div className="editor-section-heading editor-selected-heading">
              <nav
                className="editor-selection-path"
                aria-label="Selected block location"
              >
                <span>
                  {isSitePart(doc.detail.kind) ? "Site part" : "Page"}
                </span>
                {location?.parent && (
                  <>
                    <span aria-hidden="true">/</span>
                    <button
                      onClick={() =>
                        dispatch({
                          type: "setUi",
                          ui: {
                            itemSelector: {
                              index: location.parentIndex,
                              zone: editorRootZone,
                            },
                          },
                          recordHistory: false,
                        })
                      }
                    >
                      {getBlockMetadata(location.parent.type).label}
                    </button>
                    <span aria-hidden="true">/</span>
                    <span>{location.column} column</span>
                  </>
                )}
                <span aria-hidden="true">/</span>
                <span>Block {(location?.index ?? 0) + 1}</span>
              </nav>
              <div className="editor-selected-title">
                <span className="editor-selected-icon">
                  <EditorIcon name={metadata.icon} />
                </span>
                <div>
                  <h2>{metadata.label}</h2>
                  <span className="editor-selected-kind">
                    {metadata.sourceLabel
                      ? `From ${metadata.sourceLabel}`
                      : "Page content"}
                  </span>
                </div>
              </div>
              <p>{metadata.description}</p>
              <BlockActions disabled={doc.busy || doc.readOnly} />
            </div>
            <div
              className="editor-inspector-tabs"
              role="tablist"
              aria-label="Block settings"
              onKeyDown={tabKeys}
            >
              <button
                id="block-content-tab"
                role="tab"
                aria-selected={blockTab === "content"}
                aria-controls="block-content-panel"
                tabIndex={blockTab === "content" ? 0 : -1}
                onClick={() => setBlockTab("content")}
              >
                Content
              </button>
              <button
                id="block-design-tab"
                role="tab"
                aria-selected={blockTab === "design"}
                aria-controls="block-design-panel"
                tabIndex={blockTab === "design" ? 0 : -1}
                onClick={() => setBlockTab("design")}
              >
                Design
              </button>
            </div>
            <fieldset
              className="editor-fieldset"
              disabled={doc.busy || doc.readOnly}
            >
              <div
                id="block-content-panel"
                role="tabpanel"
                aria-labelledby="block-content-tab"
                hidden={blockTab !== "content"}
              >
                <Puck.Fields />
              </div>
              <div
                id="block-design-panel"
                role="tabpanel"
                aria-labelledby="block-design-tab"
                hidden={blockTab !== "design"}
              >
                <BlockDesignPanel />
              </div>
            </fieldset>
          </>
        ) : (
          <div className="editor-inspector-empty">
            <EditorIcon name="outline" />
            <h2>Select a block</h2>
            <p>
              Click content in the canvas or choose a block in List view to edit
              its settings.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
