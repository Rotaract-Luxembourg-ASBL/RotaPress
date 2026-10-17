"use client";

import { useState } from "react";
import type { AlbumData, AlbumDetail } from "@/features/media/album_schemas";
import { GalleryPresentation } from "@/features/cms/ui/gallery-presentation";
import { request, errorMessage } from "./api";
import { MediaAttachmentDialog } from "./media-attachment-dialog";
import { MediaGalleryDialog } from "./media-gallery-dialog";
import { Notice } from "./primitives";

const emptyAlbum: AlbumData = {
  title: "",
  description: "",
  items: [],
  columns: "three",
  aspectRatio: "landscape",
  layout: "grid",
  fit: "cover",
  lightbox: true,
};

export function MediaAlbumEditor({
  initial,
  onClose,
  onChanged,
}: {
  initial?: AlbumDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(initial);
  const [data, setData] = useState<AlbumData>(initial?.draft ?? emptyAlbum);
  const [dirty, setDirty] = useState(false);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const unpublished = !detail?.publishedRevisionId;
  function update(changes: Partial<AlbumData>) {
    setData({ ...data, ...changes });
    setDirty(true);
    setMessage("");
  }
  async function mutate(action: "save" | "publish" | "unpublish" | "delete") {
    if (busy) return;
    if (
      action === "delete" &&
      !window.confirm(
        "Delete this album permanently? The photographs remain in your media library.",
      )
    )
      return;
    if (
      action === "unpublish" &&
      !window.confirm(
        "Unpublish this album? Albums still linked from published content cannot be unpublished.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const base = "/api/admin/media/albums";
      if (action === "delete" && detail) {
        await request(`${base}/${detail.id}`, {
          method: "DELETE",
          body: JSON.stringify({ expectedVersion: detail.version }),
        });
        onChanged();
        onClose();
        return;
      }
      const result = await request<AlbumDetail>(
        action === "save"
          ? detail
            ? `${base}/${detail.id}`
            : base
          : `${base}/${detail!.id}/publication`,
        {
          method:
            action === "save"
              ? detail
                ? "PATCH"
                : "POST"
              : action === "publish"
                ? "POST"
                : "DELETE",
          body: JSON.stringify(
            action === "save"
              ? detail
                ? { expectedVersion: detail.version, data }
                : data
              : { expectedVersion: detail!.version },
          ),
        },
      );
      setDetail(result);
      setData(result.draft);
      setDirty(false);
      setMessage(
        action === "save"
          ? "Album draft saved."
          : action === "publish"
            ? "Album published. Linked galleries now show this version."
            : "Album unpublished.",
      );
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <MediaAttachmentDialog
      title={detail ? "Edit photo album" : "Create photo album"}
      onClose={onClose}
      canClose={() =>
        !busy &&
        (!dirty || window.confirm("Discard your unsaved album changes?"))
      }
      busy={busy}
    >
      <div className="media-album-workbench">
        <section className="media-album-preview" aria-label="Album preview">
          <div className="media-album-preview-heading">
            <div>
              <h3>{data.title || "Untitled album"}</h3>
              <p>{data.description}</p>
            </div>
            <span
              className={`media-badge media-badge-${unpublished ? "private" : "public"}`}
            >
              {unpublished
                ? "Draft album"
                : detail?.draftRevisionId === detail?.publishedRevisionId
                  ? "Published"
                  : "Unpublished changes"}
            </span>
          </div>
          {data.items.length ? (
            <GalleryPresentation {...data} lightbox={false} />
          ) : (
            <div className="media-empty">
              <h3>Add photographs to your album</h3>
              <p>Choose up to 30 photographs, arrange them and add captions.</p>
            </div>
          )}
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => setComposing(true)}
          >
            {data.items.length ? "Arrange photographs" : "Add photographs"}
          </button>
        </section>
        <form
          className="media-album-inspector"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate("save");
          }}
        >
          <div className="form-stack media-album-fields">
            {error && <Notice>{error}</Notice>}
            {message && <Notice kind="success">{message}</Notice>}
            <label>
              Album title
              <input
                value={data.title}
                required
                maxLength={160}
                disabled={busy}
                onChange={(event) => update({ title: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                value={data.description}
                maxLength={1000}
                rows={3}
                disabled={busy}
                onChange={(event) =>
                  update({ description: event.target.value })
                }
              />
            </label>
            <label>
              Layout
              <select
                value={data.layout}
                disabled={busy}
                onChange={(event) =>
                  update({ layout: event.target.value as AlbumData["layout"] })
                }
              >
                <option value="grid">Grid</option>
                <option value="masonry">Masonry</option>
                <option value="slider">Slider</option>
              </select>
            </label>
            <label>
              Columns
              <select
                value={data.columns}
                disabled={busy || data.layout === "slider"}
                onChange={(event) =>
                  update({
                    columns: event.target.value as AlbumData["columns"],
                  })
                }
              >
                <option value="two">Two</option>
                <option value="three">Three</option>
                <option value="four">Four</option>
              </select>
            </label>
            <label>
              Photo shape
              <select
                value={data.aspectRatio}
                disabled={busy || data.layout === "masonry"}
                onChange={(event) =>
                  update({
                    aspectRatio: event.target.value as AlbumData["aspectRatio"],
                  })
                }
              >
                <option value="original">Original</option>
                <option value="square">Square</option>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
                <option value="wide">Wide</option>
              </select>
            </label>
            <label>
              Image fit
              <select
                value={data.fit}
                disabled={busy}
                onChange={(event) =>
                  update({ fit: event.target.value as AlbumData["fit"] })
                }
              >
                <option value="cover">Fill the frame</option>
                <option value="contain">Show the entire image</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={data.lightbox}
                disabled={busy}
                onChange={(event) => update({ lightbox: event.target.checked })}
              />
              Open photographs in a lightbox
            </label>
            <div className="media-visibility-note">
              <h3>Linked galleries</h3>
              <p>
                Saving keeps your changes in this album draft. Publishing
                updates every linked gallery. Independent copies keep their own
                photographs and captions.
              </p>
              {detail && (
                <p>
                  {detail.publishedReferences} published references ·{" "}
                  {detail.savedReferences} retained references
                </p>
              )}
            </div>
            {detail && (
              <div className="media-album-secondary-actions">
                {!unpublished && (
                  <button
                    type="button"
                    className="inline-button"
                    disabled={busy || dirty || detail.publishedReferences > 0}
                    onClick={() => void mutate("unpublish")}
                  >
                    Unpublish album
                  </button>
                )}
                <button
                  type="button"
                  className="inline-button media-delete"
                  disabled={
                    busy ||
                    !unpublished ||
                    detail.savedReferences > 0 ||
                    detail.publishedReferences > 0
                  }
                  onClick={() => void mutate("delete")}
                >
                  Delete album
                </button>
              </div>
            )}
          </div>
          <footer className="media-album-actions">
            <div className="button-row">
              <button
                className="button button-outline"
                disabled={busy || (!dirty && !!detail)}
              >
                {busy ? "Working…" : "Save draft"}
              </button>
              <button
                type="button"
                className="button button-accent"
                disabled={
                  busy ||
                  dirty ||
                  !detail ||
                  !data.items.length ||
                  detail.draftRevisionId === detail.publishedRevisionId
                }
                onClick={() => void mutate("publish")}
              >
                Publish album
              </button>
            </div>
            <p className="field-help" role="status">
              {dirty
                ? "Save your draft before publishing."
                : "Only public photographs can appear in a published album."}
            </p>
          </footer>
        </form>
      </div>
      {composing && (
        <MediaGalleryDialog
          items={data.items}
          onDismiss={() => setComposing(false)}
          onInsert={(items) => {
            update({
              items: items.map((item) => ({
                assetId: item.assetId,
                alt: item.alt,
                caption: item.caption ?? "",
                ...(item.focalX !== undefined ? { focalX: item.focalX } : {}),
                ...(item.focalY !== undefined ? { focalY: item.focalY } : {}),
              })),
            });
            setComposing(false);
          }}
        />
      )}
    </MediaAttachmentDialog>
  );
}
