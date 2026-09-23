"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { EditorDocument } from "./use-editor-document";
import type { EditorDialogName } from "./editor-panels";
import { Icon as EditorIcon } from "@/ui/icon";
import { useEditorPuck } from "./editor-blocks";
import { isSitePart } from "../cms_schemas";
import { UnsavedPreview } from "./unsaved-preview";

export function EditorToolbar({
  document: doc,
  canPublish,
  panel,
  togglePanel,
  openPageSettings,
  openDialog,
}: {
  document: EditorDocument;
  canPublish: boolean;
  panel: "blocks" | "outline" | null;
  togglePanel: (panel: "blocks" | "outline") => void;
  openPageSettings: (focusTitle?: boolean) => void;
  openDialog: (name: EditorDialogName) => void;
}) {
  const dispatch = useEditorPuck((state) => state.dispatch);
  const history = doc.history;
  const menu = useRef<HTMLDetailsElement>(null);
  const shared = isSitePart(doc.detail.kind);
  const settingsLabel = shared
    ? "Site part settings"
    : doc.detail.kind === "section"
      ? "Section settings"
      : "Page settings";
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        menu.current &&
        !menu.current.contains(event.target)
      )
        menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      // Capture before Puck's global shortcuts, which use its debounced history.
      event.stopImmediatePropagation();
      if (
        !doc.isLocked() &&
        (document.querySelector("dialog[open]") ||
          (event.target instanceof Element &&
            event.target.closest("#editor-page-panel")))
      )
        return; // Keep native text undo in document metadata and dialogs.
      event.preventDefault();
      if (!doc.isLocked())
        history.step(key === "y" || event.shiftKey ? 1 : -1, dispatch);
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [dispatch, doc, history]);
  const currentIsPublished =
    doc.detail.publishedRevisionId === doc.detail.draft.id;
  const status = doc.dirty
    ? "Unsaved changes"
    : doc.readOnly
      ? "Read-only"
      : currentIsPublished
        ? "Published"
        : "Saved draft";
  function dialog(name: EditorDialogName) {
    if (menu.current) menu.current.open = false;
    openDialog(name);
  }
  return (
    <header
      className="editor-toolbar"
      aria-label={
        isSitePart(doc.detail.kind)
          ? "Shared site part editing toolbar"
          : "Page editing toolbar"
      }
    >
      <div className="editor-toolbar-navigation">
        <Link
          href={
            isSitePart(doc.detail.kind)
              ? "/admin/website?tab=parts"
              : "/admin/website?tab=pages"
          }
          className="editor-back"
          aria-label="Back to Website"
          title="Back to Website"
          onClick={(event) => {
            if (
              doc.dirty &&
              !window.confirm("Leave this editor and discard unsaved changes?")
            )
              event.preventDefault();
          }}
        >
          <EditorIcon name="back" />
        </Link>
        <button
          className="editor-icon-button editor-add-button"
          aria-label="Add blocks"
          title="Add blocks"
          aria-pressed={panel === "blocks"}
          disabled={doc.busy || doc.readOnly}
          onClick={() => togglePanel("blocks")}
        >
          <EditorIcon name="plus" />
        </button>
        <button
          className="editor-icon-button"
          aria-label="List view"
          title="List view"
          aria-pressed={panel === "outline"}
          onClick={() => togglePanel("outline")}
        >
          <EditorIcon name="outline" />
        </button>
        <span className="editor-toolbar-divider" />
        <button
          className="editor-icon-button editor-history-button"
          title="Undo block edit"
          aria-label="Undo block edit"
          disabled={doc.busy || !history.hasPast || doc.readOnly}
          onClick={() => {
            if (!doc.isLocked()) history.step(-1, dispatch);
          }}
        >
          <EditorIcon name="undo" />
        </button>
        <button
          className="editor-icon-button editor-history-button"
          title="Redo block edit"
          aria-label="Redo block edit"
          disabled={doc.busy || !history.hasFuture || doc.readOnly}
          onClick={() => {
            if (!doc.isLocked()) history.step(1, dispatch);
          }}
        >
          <EditorIcon name="redo" />
        </button>
      </div>
      <div className="editor-document-label">
        <h1>
          <button
            className="editor-document-name"
            onClick={() => openPageSettings(true)}
            aria-label={
              shared ? "Edit shared part name" : "Edit page name and title"
            }
            title={
              shared ? "Edit shared part name" : "Edit page name and title"
            }
          >
            <span>{doc.metadata.title || "Untitled page"}</span>
            <EditorIcon name="edit" width="14" height="14" />
          </button>
        </h1>
        <span
          className={
            doc.dirty ? "editor-save-state is-dirty" : "editor-save-state"
          }
          role="status"
        >
          {isSitePart(doc.detail.kind) && `Shared ${doc.detail.kind} · `}
          {status} · {doc.detail.locale.toUpperCase()}
        </span>
      </div>
      <div className="editor-toolbar-actions">
        <UnsavedPreview
          endpoint={`/api/admin/cms/content/${doc.detail.id}/preview`}
          disabled={doc.readOnly || doc.busy}
          payload={{
            locale: doc.detail.locale,
            expectedRevisionId: doc.detail.draft.id,
            title: doc.metadata.title,
            slug: doc.metadata.slug,
            description: doc.metadata.description,
            socialImageId: doc.metadata.socialImageId,
            data: {
              root: doc.metadata.data.root,
              content: doc.data.content,
            },
          }}
        />
        <button
          className="button button-outline button-small editor-save"
          title="Save draft (Ctrl / ⌘ + S)"
          disabled={doc.busy || doc.readOnly}
          onClick={doc.save}
        >
          Save draft
        </button>
        {canPublish && (
          <button
            className="button button-accent button-small"
            aria-label="Publish saved draft"
            title={
              doc.dirty
                ? "Save your changes before publishing"
                : "Publish the saved revision"
            }
            disabled={
              doc.busy || doc.dirty || doc.readOnly || currentIsPublished
            }
            onClick={() => doc.operation("publish")}
          >
            {doc.detail.publishedRevisionId ? "Update" : "Publish"}
          </button>
        )}
        <button
          className="button button-outline button-small editor-page-settings-button"
          aria-controls="editor-page-panel"
          onClick={() => openPageSettings()}
        >
          <EditorIcon name="settings" />
          {settingsLabel}
        </button>
        <details
          ref={menu}
          className="editor-more"
          onKeyDown={(event) => {
            if (event.key === "Escape" && menu.current) {
              menu.current.open = false;
              menu.current.querySelector("summary")?.focus();
            }
          }}
        >
          <summary
            aria-label={
              isSitePart(doc.detail.kind)
                ? "More shared part actions"
                : "More page actions"
            }
            title="More actions"
          >
            <EditorIcon name="more" />
          </summary>
          <div className="editor-more-popover">
            <span className="editor-menu-label">
              {isSitePart(doc.detail.kind)
                ? "SHARED SITE PART"
                : "PAGE ACTIONS"}
            </span>
            <button
              onClick={() => {
                if (menu.current) menu.current.open = false;
                openPageSettings(true);
              }}
            >
              {shared ? "Site part settings" : "Page settings & SEO"}
            </button>
            <button onClick={() => dialog("revisions")}>
              Revision history <span>{doc.detail.revisions.length}</span>
            </button>
            <Link
              href={`/admin/website/${doc.detail.id}/preview?locale=${doc.detail.locale}`}
              target="_blank"
              onClick={() => {
                if (menu.current) menu.current.open = false;
              }}
            >
              Preview saved draft ↗
            </Link>
            <button onClick={() => dialog("schedule")}>
              Scheduled publication
            </button>
            {!isSitePart(doc.detail.kind) && (
              <button onClick={() => dialog("duplicate")}>
                Duplicate page
              </button>
            )}
            <button onClick={() => dialog("locale")} disabled={doc.readOnly}>
              Add a language
            </button>
            <button onClick={() => dialog("help")}>
              Editing help & shortcuts
            </button>
            {canPublish && doc.detail.publishedRevisionId && (
              <button
                disabled={doc.busy || doc.dirty || doc.readOnly}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                  void doc.operation("unpublish");
                }}
              >
                Unpublish
              </button>
            )}
            {canPublish && !doc.readOnly && (
              <button
                className="editor-danger"
                disabled={doc.busy || doc.dirty}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                  void doc.operation("archive");
                }}
              >
                Archive this content
              </button>
            )}
          </div>
        </details>
      </div>
    </header>
  );
}
