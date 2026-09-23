"use client";
import { useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request } from "@/ui/api";
import { Dialog } from "@/ui/dialog";
import { MediaPicker } from "@/ui/media-library";
import { Notice } from "@/ui/primitives";
import { websiteStyle } from "../../cms/appearance";
import { PartnerCollection } from "./partner-collection";
import type { PartnerDto, PartnerProfile } from "../partner_schemas";

const blank: PartnerProfile = {
  name: "",
  category: "partner",
  description: "",
  website: "",
  logoId: null,
};

export function PartnerEditor({
  initial,
  close,
  changed,
  category,
}: {
  initial: PartnerDto | null;
  category: PartnerProfile["category"];
  close: () => void;
  changed: () => void;
}) {
  const { capabilities } = useCurrentUser();
  const [record, setRecord] = useState(initial);
  const [profile, setProfile] = useState(
    initial?.draft ?? { ...blank, category },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState<"publish" | "unpublish" | null>(null);
  const [preview, setPreview] = useState<"desktop" | "phone" | null>(null);
  const dirty =
    JSON.stringify(profile) !==
    JSON.stringify(record?.draft ?? { ...blank, category });
  const canPublish = capabilities.includes("cms.publish");
  async function act(operation: "save" | "publish" | "unpublish" | "restore") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request<PartnerDto>(
        record
          ? `/api/admin/partners/${record.id}/${operation}`
          : "/api/admin/partners",
        {
          method: "POST",
          body: JSON.stringify(
            record
              ? {
                  expectedVersion: record.version,
                  ...(operation === "save"
                    ? { profile }
                    : operation === "restore"
                      ? {}
                      : { confirmed: true }),
                }
              : profile,
          ),
        },
      );
      setRecord(result);
      setProfile(result.draft);
      setReview(null);
      changed();
      setMessage(
        operation === "save" || operation === "restore"
          ? "Draft saved. The public profile is unchanged."
          : operation === "publish"
            ? "Profile published across its selected placements."
            : "Profile unpublished. Its draft is retained.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={record ? "Edit shared profile" : "New directory profile"}
      onClose={close}
      canClose={() =>
        !busy && (!dirty || window.confirm("Discard unsaved profile changes?"))
      }
    >
      <p className="field-help">
        One club-wide profile, reused by website and event blocks. Saving a
        draft keeps the public website unchanged.
      </p>
      {(error || message) && (
        <Notice kind={error ? "error" : "success"}>{error || message}</Notice>
      )}
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void act("save");
        }}
      >
        <fieldset
          className="editor-fieldset form-stack"
          disabled={busy || Boolean(review)}
        >
          <label>
            {profile.category === "team"
              ? "Person's name"
              : "Organization name"}
            <input
              required
              maxLength={160}
              value={profile.name}
              onChange={(event) =>
                setProfile({ ...profile, name: event.target.value })
              }
            />
          </label>
          <label>
            Relationship
            <select
              value={profile.category}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  category: event.target.value as PartnerProfile["category"],
                })
              }
            >
              <option value="partner">Partner</option>
              <option value="sponsor">Sponsor</option>
              <option value="team">Team member</option>
            </select>
          </label>
          {profile.category === "team" && (
            <label>
              Role or position
              <input
                value={profile.role ?? ""}
                maxLength={120}
                onChange={(e) =>
                  setProfile({ ...profile, role: e.target.value })
                }
              />
              <span className="field-help">
                This public profile never grants membership or permissions.
              </span>
            </label>
          )}
          <label>
            Public description
            <textarea
              maxLength={1000}
              value={profile.description}
              onChange={(event) =>
                setProfile({ ...profile, description: event.target.value })
              }
            />
          </label>
          <label>
            Website link
            <input
              maxLength={2000}
              value={profile.website}
              placeholder="https://"
              onChange={(event) =>
                setProfile({ ...profile, website: event.target.value })
              }
            />
          </label>
          <MediaPicker
            label={profile.category === "team" ? "Portrait" : "Logo"}
            value={profile.logoId ?? ""}
            onChange={(id) => setProfile({ ...profile, logoId: id || null })}
          />
          <p className="field-help">
            A logo must be explicitly public in Media before this profile can be
            published.
          </p>
        </fieldset>
        <div className="cms-actions">
          <button
            className="button button-accent"
            disabled={busy || Boolean(review) || (!dirty && Boolean(record))}
          >
            Save draft
          </button>
          <button
            className="button button-outline"
            type="button"
            onClick={() => setPreview(preview ? null : "desktop")}
          >
            Preview profile
          </button>
          {record?.previous && (
            <button
              className="button button-outline"
              type="button"
              disabled={busy || dirty || Boolean(review)}
              onClick={() => void act("restore")}
            >
              Restore previous publication to draft
            </button>
          )}
        </div>
      </form>
      {preview && (
        <section
          className="partner-preview-panel"
          aria-label="Private profile preview"
        >
          <p className="field-help">
            Private preview of the profile above. Page blocks use the published
            profile.
          </p>
          <div
            className="cms-actions"
            role="group"
            aria-label="Profile preview width"
          >
            <button
              className="button button-outline button-small"
              aria-pressed={preview === "desktop"}
              onClick={() => setPreview("desktop")}
            >
              Desktop
            </button>
            <button
              className="button button-outline button-small"
              aria-pressed={preview === "phone"}
              onClick={() => setPreview("phone")}
            >
              Phone
            </button>
          </div>
          <div
            className="cms-public partner-preview"
            data-width={preview}
            style={websiteStyle({
              themeId: "default",
              accentColor: null,
              font: null,
            })}
          >
            <PartnerCollection
              title=""
              presentation="cards"
              items={[{ ...profile, id: record?.id ?? "preview" }]}
            />
          </div>
        </section>
      )}
      {record && (
        <section className="partner-publication form-stack">
          <h3>Shared publication</h3>
          <p>
            {record.published
              ? record.changed
                ? "Published with a private draft."
                : "Published profile is up to date."
              : "This profile is a private draft."}
          </p>
          <p className="field-help">
            Publishing updates every placement that selects this profile,
            including pages using a listed reusable section. It does not change
            page layouts or enable event features.
          </p>
          {record.placements.length ? (
            <ul>
              {record.placements.map((placement, index) => (
                <li
                  key={`${placement.id ?? "restricted"}-${placement.locale ?? index}`}
                >
                  {placement.id ? (
                    <Link
                      className="text-link"
                      target="_blank"
                      href={
                        placement.locale === null && placement.eventId
                          ? `/admin/events/${placement.eventId}?tab=prizes`
                          : `/admin/website/${placement.id}?locale=${placement.locale}`
                      }
                    >
                      {placement.title}
                      {placement.locale ? ` (${placement.locale})` : ""}
                      {placement.eventId ? " · Event" : ""}
                    </Link>
                  ) : (
                    <span>Restricted event page</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">No published placements yet.</p>
          )}
          {review ? (
            <div className="notice notice-info">
              <p>
                {review === "publish"
                  ? `Publish “${record.draft.name}” to all selected website and event placements?`
                  : `Unpublish “${record.draft.name}”? It will no longer be available for new page selections.`}
              </p>
              <div className="cms-actions">
                <button
                  className="button button-accent"
                  disabled={busy}
                  onClick={() => void act(review)}
                >
                  Confirm{" "}
                  {review === "publish" ? "publication" : "unpublication"}
                </button>
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => setReview(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            canPublish && (
              <div className="cms-actions">
                <button
                  className="button button-accent"
                  disabled={busy || dirty || !record.changed}
                  onClick={() => setReview("publish")}
                >
                  Review publication
                </button>
                {record.published && (
                  <button
                    className="button button-outline"
                    disabled={
                      busy ||
                      dirty ||
                      record.placements.some((placement) => !placement.dynamic)
                    }
                    onClick={() => setReview("unpublish")}
                  >
                    Unpublish profile
                  </button>
                )}
              </div>
            )
          )}
          {record.published && record.placements.length > 0 && (
            <p className="field-help">
              To unpublish, remove this selection from its published placements
              first.
            </p>
          )}
        </section>
      )}
    </Dialog>
  );
}
