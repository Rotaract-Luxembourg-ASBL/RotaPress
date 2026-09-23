"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MediaPicker } from "@/ui/media-library";
import { Notice } from "@/ui/primitives";
import type { EditorDocument } from "./use-editor-document";
import { Icon as EditorIcon } from "@/ui/icon";
import { isSitePart } from "../cms_schemas";
import Link from "next/link";

export type EditorDialogName =
  "revisions" | "duplicate" | "locale" | "help" | "schedule";

export function PageSettings({ document: doc }: { document: EditorDocument }) {
  const { metadata, detail, setMetadata } = doc;
  const shared = isSitePart(detail.kind);
  return (
    <div className="editor-page-settings">
      <div className="editor-section-heading">
        <h2>
          {shared
            ? `Shared ${detail.kind} settings`
            : detail.kind === "section"
              ? "Section settings"
              : "Page settings"}
        </h2>
        <p>
          {shared
            ? "Shared site part. When selected as the published default, changes apply to every page in this language."
            : "Edit the page name, address and SEO details here. Select blocks to change the page content."}
        </p>
      </div>
      <fieldset disabled={doc.busy || doc.readOnly} className="editor-fieldset">
        <label>
          {shared ? "Name" : "Page title"}
          <input
            id="editor-page-title"
            aria-describedby={!shared ? "editor-title-help" : undefined}
            value={metadata.title}
            maxLength={160}
            onChange={(event) =>
              setMetadata({ ...metadata, title: event.target.value })
            }
          />
        </label>
        {!shared && (
          <p id="editor-title-help" className="editor-field-help">
            This names the page in Website and supplies its browser and SEO
            title. Edit the heading shown on the page in its content block.
          </p>
        )}
        {!shared && (
          <>
            <label>
              URL slug
              <input
                value={metadata.slug}
                maxLength={100}
                onChange={(event) =>
                  setMetadata({ ...metadata, slug: event.target.value })
                }
              />
            </label>
            <p className="editor-url">
              /pages/{detail.locale}/{metadata.slug}
            </p>
          </>
        )}
        <div className="editor-setting-row">
          <span>Language</span>
          <strong>
            {
              { en: "English", fr: "French", lb: "Luxembourgish" }[
                detail.locale
              ]
            }
          </strong>
        </div>
        <div className="editor-setting-row">
          <span>Visibility</span>
          <strong>
            {detail.publishedRevisionId ? "Published" : "Private draft"}
          </strong>
        </div>
        {!shared && (
          <section
            className="editor-settings-group"
            aria-label="SEO and social sharing"
          >
            <h3>SEO &amp; social sharing</h3>
            <p className="editor-help">
              The page title above is also the search title. Changes appear
              publicly only after publication.
            </p>
            <label>
              SEO description
              <textarea
                rows={4}
                maxLength={300}
                value={metadata.description}
                onChange={(event) =>
                  setMetadata({ ...metadata, description: event.target.value })
                }
              />
            </label>
            <span className="editor-character-count">
              {metadata.description.length} / 300
            </span>
            <span className="field-label">Social preview image</span>
            <MediaPicker
              value={metadata.socialImageId || ""}
              onChange={(id) =>
                setMetadata({ ...metadata, socialImageId: id || null })
              }
            />
            <p className="editor-help">
              Choose a public image before publishing. Page images are added as
              blocks in the canvas.
            </p>
          </section>
        )}
      </fieldset>
      {(shared || detail.kind === "section") && (
        <section className="editor-settings-group">
          <h3>Affected pages</h3>
          <p className="editor-help">
            Publishing this {shared ? detail.kind : "section"} updates these
            published pages.
          </p>
          {detail.affectedPages.length ? (
            <ul>
              {detail.affectedPages.map((page) => (
                <li key={`${page.id}-${page.locale}`}>
                  {page.title} · {page.locale.toUpperCase()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="editor-help">
              {shared
                ? "No published pages currently inherit this part. Website settings choose the default after publication."
                : "No published pages reference this section yet."}
            </p>
          )}
        </section>
      )}
      <p className="editor-help">
        {shared ? (
          <>
            Menu blocks reference{" "}
            <Link href="/admin/website?tab=menus" target="_blank">
              shared navigation
            </Link>
            . Edit its links once for the whole website.
          </>
        ) : (
          <>
            Pages inherit the published{" "}
            <Link href="/admin/website?tab=parts" target="_blank">
              shared header and footer
            </Link>
            .
          </>
        )}
      </p>
      <p className="editor-help editor-saved-help">
        Save keeps changes private. Publish applies the saved revision to the
        website.
      </p>
    </div>
  );
}

function EditorDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="editor-dialog"
      aria-label={title}
      onClose={close}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="editor-icon-button"
          aria-label="Close dialog"
          onClick={() => dialog.current?.close()}
        >
          <EditorIcon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function DocumentDialog({
  name,
  document: doc,
  close,
}: {
  name: Exclude<EditorDialogName, "schedule">;
  document: EditorDocument;
  close: () => void;
}) {
  const titles = {
    revisions: "Revision history",
    duplicate: "Duplicate page",
    locale: "Add a language",
    help: "Editing your page",
  };
  return (
    <EditorDialog title={titles[name]} close={close}>
      {doc.error && <Notice>{doc.error}</Notice>}
      {name === "help" ? (
        <div className="editor-help-content">
          <p>
            Click a heading or introduction in the canvas to type directly.
            Select any block to open its settings.
          </p>
          <p>
            Use <strong>Add blocks</strong> to insert content. Drag blocks in
            List view, or use Move up and Move down in block settings.
          </p>
          <p>
            Image blocks offer your media library, alternative text, captions,
            alignment and display options. Uploads start private; make an image
            public explicitly before publishing it.
          </p>
          <dl>
            <dt>Save draft</dt>
            <dd>Ctrl / ⌘ + S</dd>
            <dt>Undo blocks</dt>
            <dd>Ctrl / ⌘ + Z</dd>
            <dt>Redo blocks</dt>
            <dd>Ctrl / ⌘ + Shift + Z</dd>
          </dl>
          <p>
            Saving keeps your changes private. Preview shows the saved draft;
            publishing makes it live. Undo applies to block edits; revision
            history also restores saved page details.
          </p>
        </div>
      ) : name === "revisions" ? (
        <>
          <p className="editor-help">
            Restoring creates a new draft. The published page stays unchanged.
          </p>
          {doc.dirty && (
            <p className="editor-inline-warning">
              Save current changes before restoring a revision.
            </p>
          )}
          <ol className="editor-revision-list">
            {doc.detail.revisions.map((revision) => (
              <li key={revision.id}>
                <div>
                  <strong>{revision.title}</strong>
                  <time>{new Date(revision.createdAt).toLocaleString()}</time>
                  <span>
                    {revision.id === doc.detail.draft.id
                      ? "Current draft"
                      : "Saved revision"}
                    {revision.id === doc.detail.publishedRevisionId
                      ? " · Published"
                      : ""}
                  </span>
                </div>
                <button
                  className="button button-outline button-small"
                  disabled={
                    doc.busy ||
                    doc.dirty ||
                    doc.readOnly ||
                    revision.id === doc.detail.draft.id
                  }
                  onClick={async () => {
                    await doc.operation("restore", revision.id);
                  }}
                >
                  Restore to draft
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <form
          className="form-stack"
          onSubmit={async (event) => {
            if (
              await doc.copy(event, name === "locale" ? "locale" : "duplicate")
            )
              close();
          }}
        >
          <p className="editor-help">
            {name === "locale"
              ? "Create an empty language variant, then write its translation."
              : "Copy the saved content into a new private draft."}
          </p>
          {doc.dirty && (
            <p className="editor-inline-warning">
              Save current changes before continuing.
            </p>
          )}
          {name === "locale" && (
            <label>
              Language
              <select name="locale">
                {(["en", "fr", "lb"] as const)
                  .filter((locale) => locale !== doc.detail.locale)
                  .map((locale) => (
                    <option key={locale} value={locale}>
                      {
                        { en: "English", fr: "French", lb: "Luxembourgish" }[
                          locale
                        ]
                      }
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            {name === "locale" ? "Translated title" : "New title"}
            <input
              name="title"
              required
              maxLength={160}
              defaultValue={
                name === "duplicate" ? `${doc.detail.draft.title} copy` : ""
              }
            />
          </label>
          <label>
            {name === "locale" ? "Translated slug" : "New slug"}
            <input
              name="slug"
              required
              maxLength={100}
              defaultValue={
                name === "duplicate" ? `${doc.detail.draft.slug}-copy` : ""
              }
            />
          </label>
          <button
            className="button button-accent"
            disabled={doc.busy || doc.dirty}
          >
            {name === "locale" ? "Create language draft" : "Duplicate draft"}
          </button>
        </form>
      )}
    </EditorDialog>
  );
}
