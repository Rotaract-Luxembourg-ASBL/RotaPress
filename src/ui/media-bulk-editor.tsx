"use client";

import { useId, useState, type FormEvent } from "react";
import { Dialog } from "./dialog";
import { Notice } from "./primitives";
import { canDiscard } from "./media-editors";

export function MediaBulkEditor({
  count,
  busy,
  error,
  onClose,
  onSave,
  onRefresh,
}: {
  count: number;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSave: (metadata: { collection?: string; tags?: string[] }) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const prefix = useId();
  const [collection, setCollection] = useState("");
  const [tags, setTags] = useState("");
  const [changeCollection, setChangeCollection] = useState(false);
  const [changeTags, setChangeTags] = useState(false);
  const [dirty, setDirty] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      ...(changeCollection ? { collection } : {}),
      ...(changeTags
        ? {
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          }
        : {}),
    });
  }
  return (
    <Dialog
      title="Edit selected images"
      onClose={onClose}
      canClose={() => !busy && canDiscard(dirty)}
    >
      <form
        className="form-stack media-bulk-editor"
        onSubmit={save}
        onChange={() => setDirty(true)}
      >
        <p>
          Update {count} selected {count === 1 ? "image" : "images"}. Selected
          fields replace their current values; all other details stay saved.
        </p>
        {error && (
          <Notice>
            {error} Your selection and edits are kept.{" "}
            <button
              type="button"
              className="inline-button"
              disabled={busy}
              onClick={onRefresh}
            >
              Refresh selected images
            </button>
          </Notice>
        )}
        <label className="media-check-label">
          <input
            type="checkbox"
            checked={changeCollection}
            onChange={(event) => setChangeCollection(event.target.checked)}
            disabled={busy}
          />
          Change collection
        </label>
        {changeCollection && (
          <div className="media-description-field">
            <label htmlFor={`${prefix}-collection`}>Collection</label>
            <input
              id={`${prefix}-collection`}
              value={collection}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setCollection(event.target.value)}
            />
            <span className="field-help">
              Leave empty to remove the collection.
            </span>
          </div>
        )}
        <label className="media-check-label">
          <input
            type="checkbox"
            checked={changeTags}
            onChange={(event) => setChangeTags(event.target.checked)}
            disabled={busy}
          />
          Change tags
        </label>
        {changeTags && (
          <div className="media-description-field">
            <label htmlFor={`${prefix}-tags`}>Tags, separated by commas</label>
            <input
              id={`${prefix}-tags`}
              value={tags}
              disabled={busy}
              onChange={(event) => setTags(event.target.value)}
            />
            <span className="field-help">
              Up to 12 tags, 40 characters each. Leave empty to remove tags.
            </span>
          </div>
        )}
        <div className="media-upload-actions">
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => {
              if (canDiscard(dirty)) onClose();
            }}
          >
            Cancel
          </button>
          <button
            className="button button-accent"
            disabled={busy || (!changeCollection && !changeTags)}
          >
            {busy ? "Updating…" : "Update selected images"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
