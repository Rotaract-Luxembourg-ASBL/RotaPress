"use client";
import Image from "next/image";
import type { WebsitePublicationReview } from "@/features/cms/website_publication";
import { DraftPreview } from "@/features/forms/ui/form-edit-panels";

export function WebsitePublicationDependencies({
  review,
  forms,
  assets,
  busy,
  onApprove,
}: {
  review: WebsitePublicationReview;
  forms: string[];
  assets: string[];
  busy: boolean;
  onApprove: (kind: "form" | "asset", id: string, checked: boolean) => void;
}) {
  return (
    <>
      {review.forms.length > 0 && (
        <section className="publication-section" aria-label="Forms to review">
          <h3>
            Forms{" "}
            <span className="publication-count">{review.forms.length}</span>
          </h3>
          <p className="field-help">
            Publish new forms to accept responses. For forms already published,
            keep the current questions or approve the saved changes.
          </p>
          {review.forms.map((form) => (
            <article className="publication-dependency" key={form.id}>
              <div className="publication-item-heading">
                <strong>{form.title}</strong>
                <span className="publication-state">
                  {forms.includes(form.id)
                    ? "Approved to publish"
                    : form.status === "draft"
                      ? "Approval needed"
                      : form.status === "changes"
                        ? "Optional update"
                        : form.status === "published"
                          ? "Already published"
                          : "Unavailable"}
                </span>
              </div>
              <p className="field-help">
                Used in {form.uses.map((use) => use.label).join(", ")}
              </p>
              {form.definition && (
                <details
                  className="publication-form-questions"
                  open={form.status === "draft"}
                >
                  <summary>Review questions</summary>
                  <DraftPreview definition={form.definition} embedded />
                </details>
              )}
              {(form.status === "draft" || form.status === "changes") && (
                <>
                  {form.canPublish ? (
                    <label className="website-check publication-approval">
                      <input
                        type="checkbox"
                        aria-label={`Publish form: ${form.title}`}
                        checked={forms.includes(form.id)}
                        disabled={busy}
                        onChange={(event) =>
                          onApprove("form", form.id, event.target.checked)
                        }
                      />
                      <span>
                        <strong>Publish form: {form.title}</strong>
                        <small>
                          Make these saved questions public and accept responses
                          when the website is published.
                        </small>
                      </span>
                    </label>
                  ) : (
                    <p className="publication-permission">
                      A staff member with permission to edit this form must
                      publish it.
                      {form.status === "changes" &&
                        " The current public questions will be kept."}
                    </p>
                  )}
                  {form.status === "changes" && !forms.includes(form.id) && (
                    <p className="field-help">
                      Keeping the currently published questions.
                    </p>
                  )}
                </>
              )}
              {form.status === "unavailable" && (
                <p className="publication-permission">
                  Restore this form or remove it from the affected page before
                  publishing.
                </p>
              )}
            </article>
          ))}
        </section>
      )}
      {review.images.length > 0 && (
        <section className="publication-section" aria-label="Images to review">
          <h3>
            Private files{" "}
            <span className="publication-count">{review.images.length}</span>
          </h3>
          <p className="field-help">
            Approve each file used by this website. Public files can be opened
            by anyone, including through a direct link.
          </p>
          {review.images.map((asset, index) => (
            <article className="publication-dependency" key={asset.id ?? index}>
              <div className="publication-file">
                {asset.id && asset.kind === "image" && (
                  <Image
                    className="publication-image-preview"
                    src={`/media/${asset.id}`}
                    alt={asset.metadata?.alt ?? ""}
                    width={96}
                    height={96}
                    unoptimized
                    data-private
                  />
                )}
                <div>
                  <strong>{asset.name}</strong>
                  <span className="publication-state">
                    {asset.id && assets.includes(asset.id)
                      ? "Approved to make public"
                      : asset.status === "private"
                        ? "Approval needed"
                        : "File unavailable"}
                  </span>
                  <ul className="publication-uses">
                    {asset.uses.map((use) => (
                      <li key={use.label + use.href}>{use.label}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {asset.id && (
                <details className="publication-file-details">
                  <summary>Review file and details</summary>
                  {asset.kind === "image" ? (
                    <Image
                      src={`/media/${asset.id}`}
                      alt={asset.metadata?.alt ?? ""}
                      width={640}
                      height={400}
                      unoptimized
                      data-private
                    />
                  ) : (
                    <a
                      href={`/media/${asset.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-link"
                    >
                      Open file
                    </a>
                  )}
                  {asset.metadata?.alt && (
                    <p>Alternative text: {asset.metadata.alt}</p>
                  )}
                  {asset.metadata?.caption && (
                    <p>Caption: {asset.metadata.caption}</p>
                  )}
                </details>
              )}
              {asset.id && asset.canPublish && asset.expectedRevision ? (
                <label className="website-check publication-approval">
                  <input
                    type="checkbox"
                    aria-label={`Make public: ${asset.name}`}
                    checked={assets.includes(asset.id)}
                    disabled={busy}
                    onChange={(event) =>
                      onApprove("asset", asset.id!, event.target.checked)
                    }
                  />
                  <span>
                    <strong>Make public: {asset.name}</strong>
                    <small>Publish this file with the website.</small>
                  </span>
                </label>
              ) : (
                <p className="publication-permission">
                  {asset.status === "unavailable"
                    ? "Replace or remove this file where it is used."
                    : "A staff member with permission to manage media must make this file public."}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
