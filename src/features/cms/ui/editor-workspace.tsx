"use client";

import { Puck } from "@puckeditor/core";
import { PublicationDialog } from "./publication-dialog";
import { useState } from "react";
import type { EditorDocument } from "./use-editor-document";
import { EditorToolbar } from "./editor-toolbar";
import { Icon as EditorIcon } from "@/ui/icon";
import { BlockLibrary, BlockActions, useEditorPuck } from "./editor-blocks";
import {
  PageSettings,
  DocumentDialog,
  type EditorDialogName,
} from "./editor-panels";
import { Notice } from "@/ui/primitives";
import { puckConfig } from "./puck-config";
import { CanvasAddBlock } from "./editor-insertion";
import { isSitePart } from "../cms_schemas";
import { BlockDesignPanel } from "./block-design-panel";

function Inspector({
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
  const [blockTab, setBlockTab] = useState<"content" | "design">("content");
  return (
    <>
      <div
        className="editor-inspector-tabs"
        role="tablist"
        aria-label="Inspector"
      >
        <button
          id="editor-page-tab"
          role="tab"
          aria-selected={tab === "page"}
          aria-controls="editor-page-panel"
          onClick={() => setTab("page")}
        >
          {isSitePart(doc.detail.kind) ? "Site part" : "Page"}
        </button>
        <button
          id="editor-block-tab"
          role="tab"
          aria-selected={tab === "block"}
          aria-controls="editor-block-panel"
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
        {selected ? (
          <>
            <div className="editor-section-heading">
              <h2>
                {puckConfig.components[selected.type].label || selected.type}
              </h2>
              <p>Edit its content or adjust its design.</p>
              <BlockActions disabled={doc.busy || doc.readOnly} />
            </div>
            <div
              className="editor-inspector-tabs"
              role="tablist"
              aria-label="Block settings"
            >
              <button
                id="block-content-tab"
                role="tab"
                aria-selected={blockTab === "content"}
                aria-controls="block-content-panel"
                onClick={() => setBlockTab("content")}
              >
                Content
              </button>
              <button
                id="block-design-tab"
                role="tab"
                aria-selected={blockTab === "design"}
                aria-controls="block-design-panel"
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

export function EditorWorkspace({
  document: doc,
  canPublish,
  panel,
  setPanel,
  insertionIndex,
  setInsertionIndex,
}: {
  document: EditorDocument;
  canPublish: boolean;
  panel: "blocks" | "outline" | null;
  setPanel: (panel: "blocks" | "outline" | null) => void;
  insertionIndex: number | null;
  setInsertionIndex: (index: number | null) => void;
}) {
  const selected = useEditorPuck((state) => state.selectedItem);
  const selectionId = selected?.props.id ?? "page";
  const dispatch = useEditorPuck((state) => state.dispatch);
  const selectedIndex = useEditorPuck(
    (state) => state.appState.ui.itemSelector?.index,
  );
  const [hiddenForSelection, setHiddenForSelection] = useState<string | null>(
    null,
  );
  const [requestedInspector, setRequestedInspector] = useState(false);
  const [inspectorChoice, setInspectorChoice] = useState<{
    selectionId: string;
    tab: "page" | "block";
  } | null>(null);
  const inspectorTab =
    inspectorChoice?.selectionId === selectionId
      ? inspectorChoice.tab
      : selected
        ? "block"
        : "page";
  const [width, setWidth] = useState<"desktop" | "tablet" | "mobile">(
    "desktop",
  );
  const [dialog, setDialog] = useState<EditorDialogName | null>(null);
  const settingsVisible = hiddenForSelection !== selectionId;
  const mobileSettingsVisible =
    settingsVisible && (requestedInspector || Boolean(selected));
  const closeSettings = () => {
    setHiddenForSelection(selectionId);
    setRequestedInspector(false);
  };
  const openPageSettings = (focusTitle = false) => {
    dispatch({
      type: "setUi",
      ui: { itemSelector: null },
      recordHistory: false,
    });
    setInspectorChoice({ selectionId: "page", tab: "page" });
    setHiddenForSelection(null);
    setRequestedInspector(true);
    setPanel(null);
    if (focusTitle)
      requestAnimationFrame(() => {
        document.getElementById("editor-page-title")?.focus();
      });
  };
  return (
    <div
      className="editor-workspace"
      data-inspector={settingsVisible}
      data-mobile-inspector={mobileSettingsVisible}
      data-library={Boolean(panel)}
    >
      <EditorToolbar
        document={doc}
        canPublish={canPublish}
        panel={panel}
        togglePanel={(next) => {
          setInsertionIndex(
            selectedIndex === undefined ? null : selectedIndex + 1,
          );
          setPanel(panel === next ? null : next);
          setRequestedInspector(false);
        }}
        openPageSettings={openPageSettings}
        openDialog={setDialog}
      />
      {(doc.error || doc.message) && !dialog && (
        <div className="editor-notification">
          <Notice kind={doc.error ? "error" : "success"}>
            {doc.error || doc.message}
          </Notice>
        </div>
      )}
      <div
        className="editor-body"
        inert={doc.busy || undefined}
        aria-busy={doc.busy}
      >
        {panel && (
          <aside
            className="editor-library"
            aria-label={panel === "blocks" ? "Block library" : "Page outline"}
          >
            <header className="editor-panel-heading">
              <h2>{panel === "blocks" ? "Add a block" : "List view"}</h2>
              <button
                className="editor-icon-button"
                aria-label="Close block panel"
                onClick={() => setPanel(null)}
              >
                <EditorIcon name="close" />
              </button>
            </header>
            {panel === "blocks" ? (
              <BlockLibrary
                kind={doc.detail.kind}
                insertionIndex={insertionIndex}
                disabled={doc.busy || doc.readOnly}
                onInsert={() => setPanel(null)}
              />
            ) : (
              <div className="editor-outline">
                <p className="editor-help">
                  Select a block to edit. Drag to reorder.
                </p>
                <Puck.Outline />
              </div>
            )}
          </aside>
        )}
        <section
          className="editor-stage"
          aria-label={
            isSitePart(doc.detail.kind)
              ? "Shared site part canvas"
              : "Page canvas"
          }
        >
          <div className="editor-canvas-toolbar">
            <span>
              {selected
                ? `${puckConfig.components[selected.type].label || selected.type} selected`
                : "Click content to edit"}
            </span>
            <div role="group" aria-label="Canvas width">
              {(["desktop", "tablet", "mobile"] as const).map((device) => (
                <button
                  key={device}
                  className="editor-icon-button"
                  title={`${device} canvas width`}
                  aria-label={`${device[0].toUpperCase()}${device.slice(1)} canvas width`}
                  aria-pressed={width === device}
                  onClick={() => setWidth(device)}
                >
                  <EditorIcon name={device} />
                </button>
              ))}
            </div>
          </div>
          <div className="editor-canvas-scroll">
            <div
              className="editor-canvas"
              data-width={width}
              inert={doc.readOnly || undefined}
            >
              <Puck.Preview />
              {doc.data.content.length > 0 && (
                <div className="editor-canvas-insert-end">
                  <CanvasAddBlock label="Add a block here" />
                </div>
              )}
              {!doc.data.content.length && (
                <div className="editor-canvas-empty">
                  <h2>Start with a block</h2>
                  <p>
                    Add a heading, some text or an image to tell your story.
                  </p>
                  <button
                    className="button button-outline"
                    onClick={() => setPanel("blocks")}
                  >
                    <EditorIcon name="plus" /> Add your first block
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
        <aside
          className="editor-inspector"
          aria-label={
            isSitePart(doc.detail.kind)
              ? "Shared site part and block settings"
              : "Page and block settings"
          }
        >
          <Inspector
            key={selectionId}
            document={doc}
            close={closeSettings}
            tab={inspectorTab}
            setTab={(tab) =>
              tab === "page"
                ? openPageSettings()
                : setInspectorChoice({ selectionId, tab })
            }
          />
        </aside>
      </div>
      <footer className="editor-statusbar">
        <span>
          {isSitePart(doc.detail.kind)
            ? `Shared ${doc.detail.kind}`
            : doc.detail.kind === "section"
              ? "Reusable section"
              : "Page"}{" "}
          ·{" "}
          {doc.data.content.reduce(
            (count, item) =>
              count +
              1 +
              (item.type === "SiteRow"
                ? item.props.left.length +
                  item.props.center.length +
                  item.props.right.length
                : 0),
            0,
          )}{" "}
          blocks
        </span>
        <span>
          {doc.busy
            ? "Working…"
            : doc.dirty
              ? "Changes are not saved"
              : `Saved ${new Date(doc.detail.draft.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        </span>
        <button onClick={() => setDialog("help")}>Editing help</button>
      </footer>
      {dialog === "schedule" ? (
        <PublicationDialog
          document={doc}
          canPublish={canPublish}
          close={() => setDialog(null)}
        />
      ) : (
        dialog && (
          <DocumentDialog
            name={dialog}
            document={doc}
            close={() => setDialog(null)}
          />
        )
      )}
    </div>
  );
}
