"use client";

import { useState, type FormEvent } from "react";
import { useResource } from "@/ui/api";
import { MediaPicker } from "@/ui/media-picker";
import { Notice } from "@/ui/primitives";
import type { PublicPartner } from "@/features/partners/partner_schemas";
import type { PrizeDraft, PrizeWorkspace } from "../prize_schemas";
import { EventPrizeGallery } from "./event-prize-gallery";
import type { PrizeMutation } from "./event-prizes-panel";

const blank: PrizeDraft = {
  title: "",
  description: "",
  imageId: null,
  alt: "",
  quantity: 1,
  position: 0,
  partnerId: null,
};

export function EventPrizeForm({
  eventId,
  record,
  disabled,
  publicationDisabled,
  canPublish,
  canUnpublish,
  mutate,
  onSelected,
  onDirty,
}: {
  eventId: string;
  record?: PrizeWorkspace["items"][number];
  disabled: boolean;
  publicationDisabled: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
  mutate: PrizeMutation;
  onSelected: (id: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(record?.draft ?? blank);
  const [preview, setPreview] = useState(false);
  const partners = useResource<{ items: PublicPartner[] }>(
    `/api/admin/partners/selection?eventId=${eventId}`,
  );
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(record?.draft ?? blank);
  const partner =
    partners.data?.items.find((item) => item.id === draft.partnerId) ?? null;
  const change = <Key extends keyof PrizeDraft>(
    key: Key,
    value: PrizeDraft[Key],
  ) => {
    const next = { ...draft, [key]: value };
    // Report before a tab/focus refresh can replace this editor's saved record.
    onDirty(JSON.stringify(next) !== JSON.stringify(record?.draft ?? blank));
    setDraft(next);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await mutate(
      "",
      {
        ...(record ? { id: record.id } : {}),
        expectedVersion: record?.version ?? 0,
        draft,
      },
      "Prize draft saved. The published gallery has not changed.",
    );
    if (result?.savedId) onSelected(result.savedId);
  }
  async function publish(operation: "publish" | "unpublish") {
    if (!record) return;
    if (
      !window.confirm(
        operation === "publish"
          ? `Publish “${record.draft.title}” to this event's prize gallery?\n\nQuantity: ${record.draft.quantity}${partner ? `\nDonor or sponsor: ${partner.name}` : ""}\n\nIt appears wherever Published prizes is placed on the event's published page. This does not run a draw or select a winner.`
          : `Remove “${record.published?.title ?? record.draft.title}” from the published prize gallery? Its saved draft and history are retained.`,
      )
    )
      return;
    await mutate(
      `/${record.id}/publication`,
      { expectedVersion: record.version, operation, confirmed: true },
      operation === "publish"
        ? "Prize published."
        : "Prize removed from the published gallery. Its draft is retained.",
    );
  }
  return (
    <section className="panel event-prize-editor" aria-label="Prize editor">
      <header>
        <h3>{record ? "Edit prize" : "New prize"}</h3>
        <p>
          Prepare the description privately, then publish the saved prize when
          ready.
        </p>
      </header>
      <form className="form-stack" onSubmit={(event) => void save(event)}>
        <fieldset className="form-stack event-fieldset" disabled={disabled}>
          <label>
            Prize title
            <input
              required
              maxLength={160}
              value={draft.title}
              onChange={(event) => change("title", event.target.value)}
            />
          </label>
          <label>
            Prize description
            <textarea
              rows={4}
              maxLength={3000}
              value={draft.description}
              onChange={(event) => change("description", event.target.value)}
            />
          </label>
          <section aria-label="Prize image">
            <h4>Prize image</h4>
            <MediaPicker
              value={draft.imageId ?? ""}
              onChange={(id) => change("imageId", id || null)}
            />
          </section>
          <label>
            Image description
            <input
              required={Boolean(draft.imageId)}
              maxLength={200}
              value={draft.alt}
              onChange={(event) => change("alt", event.target.value)}
            />
          </label>
          <div className="event-prize-fields">
            <label>
              Quantity
              <input
                type="number"
                required
                min={1}
                max={10000}
                step={1}
                value={draft.quantity}
                onChange={(event) =>
                  change("quantity", Number(event.target.value))
                }
              />
            </label>
            <label>
              Display order
              <input
                type="number"
                required
                min={0}
                max={9999}
                step={1}
                value={draft.position}
                onChange={(event) =>
                  change("position", Number(event.target.value))
                }
              />
            </label>
          </div>
          <label>
            Donor or sponsor
            <select
              value={draft.partnerId ?? ""}
              onChange={(event) =>
                change("partnerId", event.target.value || null)
              }
            >
              <option value="">No linked profile</option>
              {draft.partnerId && !partner && (
                <option value={draft.partnerId}>
                  Unavailable profile — selection retained
                </option>
              )}
              {partners.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p className="field-help">
            Choose an existing published profile. Its name, logo and website
            stay connected to the club's Partners &amp; Sponsors library.
          </p>
          {partners.error && <Notice>{partners.error}</Notice>}
          <div className="event-inline-actions">
            <button
              type="submit"
              className="button button-accent"
              disabled={!dirty}
            >
              {record ? "Save prize draft" : "Create prize draft"}
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => setPreview((current) => !current)}
            >
              {preview ? "Close prize preview" : "Preview prize"}
            </button>
          </div>
        </fieldset>
      </form>
      {preview && (
        <section
          className="event-prize-preview"
          aria-label="Private prize preview"
        >
          <p className="field-help">
            Private preview of current input. Saving and publication are
            separate actions.
          </p>
          <EventPrizeGallery
            items={[
              {
                ...draft,
                id: record?.id ?? "preview",
                revisionId: "preview",
                partner,
              },
            ]}
          />
        </section>
      )}
      {record && (
        <div className="event-inline-actions">
          {canPublish && (
            <button
              type="button"
              className="button button-accent"
              disabled={publicationDisabled || dirty}
              onClick={() => void publish("publish")}
            >
              Publish prize
            </button>
          )}
          {record.published && canUnpublish && (
            <button
              type="button"
              className="button button-outline"
              disabled={publicationDisabled || dirty}
              onClick={() => void publish("unpublish")}
            >
              Remove from published gallery
            </button>
          )}
        </div>
      )}
      {dirty && record && (
        <p className="field-help">
          Save this draft before reviewing publication.
        </p>
      )}
      {record?.published && (
        <div className="event-prize-published">
          <h4>Published prize</h4>
          <EventPrizeGallery items={[record.published]} />
        </div>
      )}
    </section>
  );
}
