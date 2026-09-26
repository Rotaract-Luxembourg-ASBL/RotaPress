"use client";

import { Puck } from "@puckeditor/core";
import { PublicationDialog } from "./publication-dialog";
import { useState } from "react";
import type { EditorDocument } from "./use-editor-document";
import { EditorToolbar } from "./editor-toolbar";
import { Icon as EditorIcon } from "@/ui/icon";
import { BlockLibrary, useEditorPuck } from "./editor-blocks";
import { DocumentDialog, type EditorDialogName } from "./editor-panels";
import { Notice } from "@/ui/primitives";
import { puckConfig } from "./puck-config";
import { CanvasAddBlock } from "./editor-insertion";
import { isSitePart } from "../cms_schemas";
import { EditorInspector } from "./editor-inspector";
import { editorRootZone, editorBlockCount } from "./editor-selection";

export function EditorWorkspace({
  document: doc,
  canPublish,
  panel,
  setPanel,
  insertionIndex,
  setInsertionIndex,
  insertionZone,
  setInsertionZone,
  insertionRequest,
}: {
  document: EditorDocument;
  canPublish: boolean;
  panel: "blocks" | "outline" | null;
  setPanel: (panel: "blocks" | "outline" | null) => void;
  insertionIndex: number | null;
  setInsertionIndex: (index: number | null) => void;
  insertionZone: string;
  setInsertionZone: (zone: string) => void;
  insertionRequest: number;
}) {
  const selected = useEditorPuck((state) => state.selectedItem);
  const selectionId = selected?.props.id ?? "page";
  const dispatch = useEditorPuck((state) => state.dispatch);
  const selector = useEditorPuck((state) => state.appState.ui.itemSelector);
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
    requestAnimationFrame(() => {
      document
        .getElementById(
          selected ? "editor-open-block-settings" : "editor-open-page-settings",
        )
        ?.focus();
    });
  };
  const closeLibrary = () => {
    setPanel(null);
    requestAnimationFrame(() =>
      document
        .getElementById(
          panel === "outline" ? "editor-open-outline" : "editor-open-library",
        )
        ?.focus(),
    );
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
          setInsertionIndex(selector ? selector.index + 1 : null);
          setInsertionZone(selector?.zone ?? editorRootZone);
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
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.defaultPrevented) {
                event.stopPropagation();
                closeLibrary();
              }
            }}
          >
            <header className="editor-panel-heading">
              <h2>{panel === "blocks" ? "Add a block" : "List view"}</h2>
              <button
                className="editor-icon-button"
                aria-label="Close block panel"
                onClick={closeLibrary}
              >
                <EditorIcon name="close" />
              </button>
            </header>
            {panel === "blocks" ? (
              <BlockLibrary
                key={`${insertionRequest}:${insertionZone}:${insertionIndex}`}
                kind={doc.detail.kind}
                insertionIndex={insertionIndex}
                insertionZone={insertionZone}
                disabled={doc.busy || doc.readOnly}
                onInsert={() => {
                  setPanel(null);
                  setHiddenForSelection(null);
                  setRequestedInspector(true);
                  requestAnimationFrame(() =>
                    document.getElementById("editor-block-tab")?.focus(),
                  );
                }}
              />
            ) : (
              <div
                className="editor-outline"
                onClick={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.closest("button")
                  ) {
                    if (window.matchMedia("(max-width: 900px)").matches)
                      setPanel(null);
                    setInspectorChoice(null);
                    setHiddenForSelection(null);
                    setRequestedInspector(true);
                  }
                }}
              >
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
              {selected && (
                <button
                  id="editor-open-block-settings"
                  className="editor-selection-button"
                  onClick={() => {
                    setHiddenForSelection(null);
                    setRequestedInspector(true);
                    setInspectorChoice({ selectionId, tab: "block" });
                    setPanel(null);
                    requestAnimationFrame(() =>
                      document.getElementById("editor-block-tab")?.focus(),
                    );
                  }}
                >
                  <EditorIcon name="controls" /> Block settings
                </button>
              )}
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
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  event.target.closest("[data-puck-component]")
                ) {
                  setInspectorChoice(null);
                  setHiddenForSelection(null);
                  setRequestedInspector(true);
                }
              }}
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
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              !event.defaultPrevented &&
              !(
                event.target instanceof Element &&
                event.target.closest("dialog")
              )
            ) {
              event.stopPropagation();
              closeSettings();
            }
          }}
          aria-label={
            isSitePart(doc.detail.kind)
              ? "Shared site part and block settings"
              : "Page and block settings"
          }
        >
          <EditorInspector
            key={selectionId}
            document={doc}
            close={closeSettings}
            tab={inspectorTab}
            setTab={(tab) => setInspectorChoice({ selectionId, tab })}
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
          · {editorBlockCount(doc.data.content)} blocks
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
