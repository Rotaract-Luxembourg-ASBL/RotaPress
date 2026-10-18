"use client";
import { useCallback, useEffect, useState } from "react";
import type { CmsLocale } from "@/features/cms/cms_schemas";
import type { WebsiteWorkspace } from "@/features/cms/website_setup_schemas";
import type {
  WebsitePublicationReview,
  WebsitePublicationScope,
} from "@/features/cms/website_publication";
import { Dialog } from "./dialog";
import { Loading, Notice } from "./primitives";
import { errorMessage, request } from "./api";
import { WebsitePublicationDependencies } from "./website-publication-dependencies";

export { websitePublicationItems } from "@/features/cms/website_publication";

export function WebsitePublication({
  workspace,
  locale,
  initialScope = "website",
  onClose,
  onPublished,
}: {
  workspace: WebsiteWorkspace;
  locale: CmsLocale;
  initialScope?: WebsitePublicationScope;
  onClose: () => void;
  onPublished: (scope: WebsitePublicationScope) => void;
}) {
  const [scope, setScope] = useState(initialScope);
  const [review, setReview] = useState<WebsitePublicationReview>();
  const [forms, setForms] = useState<string[]>([]);
  const [assets, setAssets] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<string>();
  const recheck = useCallback(() => {
    setReview(undefined);
    setConfirmed(false);
    setForms([]);
    setAssets([]);
    setChecking(true);
    setRetry((value) => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    request<WebsitePublicationReview>(
      `/api/admin/cms/website/review?locale=${locale}&scope=${scope}`,
    )
      .then((result) => {
        if (active) {
          setReview(result);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [locale, scope, retry]);
  const pendingForms =
    review?.forms.filter(
      (form) => form.status === "draft" && !forms.includes(form.id),
    ).length ?? 0;
  const pendingImages =
    review?.images.filter((image) => !image.id || !assets.includes(image.id))
      .length ?? 0;
  const blocked =
    !review ||
    review.problems.length > 0 ||
    review.forms.some((form) => form.status === "unavailable") ||
    pendingForms > 0 ||
    pendingImages > 0;
  const previewId =
    review?.pages.find(
      (item) =>
        item.kind === "page" &&
        item.id === (preview ?? workspace.site.draft.homePageId),
    )?.id ?? review?.pages.find((item) => item.kind === "page")?.id;
  function approve(kind: "form" | "asset", id: string, checked: boolean) {
    const setter = kind === "form" ? setForms : setAssets;
    setter((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );
    setConfirmed(false);
  }
  async function publish() {
    if (busy || checking || !confirmed || blocked || !review) return;
    setBusy(true);
    setError("");
    try {
      await request("/api/admin/cms/website/publish", {
        method: "POST",
        body: JSON.stringify({
          locale,
          scope,
          expectedVersion: review.version,
          confirmed: true,
          pages: review.pages.map(({ id, expectedRevisionId }) => ({
            id,
            expectedRevisionId,
          })),
          forms: review.forms
            .filter((form) => forms.includes(form.id))
            .map((form) => ({
              id: form.id,
              expectedRevision: form.expectedRevision,
              confirmed: true,
            })),
          assets: review.images
            .filter((image) => image.id && assets.includes(image.id))
            .map((image) => ({
              id: image.id,
              expectedRevision: image.expectedRevision,
              confirmed: true,
            })),
        }),
      });
      onPublished(scope);
      onClose();
    } catch (cause) {
      // Never retry with approvals for saved content that may have changed.
      const message = errorMessage(cause);
      recheck();
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Publish website" onClose={onClose} canClose={() => !busy}>
      <div className="website-publication">
        <div className="website-publication-body form-stack">
          <p className="publication-intro">
            Review everything here. Approve any forms or private files below,
            then publish once.
          </p>
          <fieldset className="website-publication-scope" disabled={busy}>
            <legend>What would you like to publish?</legend>
            {(["website", "menu"] as const).map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name="publication-scope"
                  value={choice}
                  checked={scope === choice}
                  disabled={choice === "menu" && !workspace.site.published}
                  onChange={() => {
                    setScope(choice);
                    setError("");
                    recheck();
                  }}
                />
                <span>
                  <strong>
                    {choice === "menu" ? "Menu only" : "Entire website"}
                  </strong>
                  <small>
                    {choice === "menu"
                      ? "Update links using published pages."
                      : "Saved pages, menu, header, footer and appearance."}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          {error && (
            <Notice>
              {error}{" "}
              <button
                className="inline-button"
                onClick={() => {
                  setError("");
                  recheck();
                }}
                disabled={busy || checking}
              >
                Check again
              </button>
            </Notice>
          )}
          {checking ? (
            <Loading />
          ) : (
            review && (
              <div className="website-publication-grid">
                <div className="publication-checklist form-stack">
                  {review.problems.map((problem, index) => (
                    <Notice key={index}>
                      {problem.message}
                      {problem.href && (
                        <>
                          {" "}
                          <a
                            href={problem.href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-link"
                          >
                            Review affected item
                          </a>
                        </>
                      )}
                    </Notice>
                  ))}
                  <WebsitePublicationDependencies
                    review={review}
                    forms={forms}
                    assets={assets}
                    busy={busy}
                    onApprove={approve}
                  />
                  <section
                    className="publication-section"
                    aria-label={
                      scope === "menu" ? "Linked pages" : "Reviewed pages"
                    }
                  >
                    <h3>
                      {scope === "menu"
                        ? "Menu destinations"
                        : "Pages and shared parts"}{" "}
                      <span className="publication-count">
                        {review.pages.length}
                      </span>
                    </h3>
                    <p className="field-help">
                      {scope === "menu"
                        ? "These links use the published pages."
                        : "These saved versions will be published together. Select a page to preview it here."}
                    </p>
                    <ul className="website-publication-list">
                      {review.pages.map((item) => (
                        <li key={item.id}>
                          {item.kind === "page" ? (
                            <button
                              type="button"
                              className="publication-page"
                              aria-pressed={previewId === item.id}
                              onClick={() => setPreview(item.id)}
                            >
                              <strong>{item.title}</strong>
                              <span>
                                {scope === "menu"
                                  ? "Menu destination"
                                  : item.changed
                                    ? "Saved changes"
                                    : "Published"}{" "}
                                · Preview
                              </span>
                            </button>
                          ) : (
                            <div className="publication-page">
                              <strong>{item.title}</strong>
                              <span>
                                {item.kind === "header" ? "Header" : "Footer"} ·{" "}
                                {item.changed ? "Saved changes" : "Published"}
                              </span>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    {!review.pages.length && (
                      <p>This menu has no linked website pages.</p>
                    )}
                  </section>
                </div>
                <aside
                  className="publication-preview"
                  aria-label="Website preview"
                >
                  <details open>
                    <summary>
                      Website preview <span>Saved draft</span>
                    </summary>
                    {previewId && (
                      <iframe
                        key={previewId}
                        title="Saved website preview"
                        src={`/admin/website/preview?inline=true&locale=${locale}&pageId=${encodeURIComponent(previewId)}`}
                      />
                    )}
                    <p className="field-help">
                      {scope === "menu"
                        ? "The preview shows saved drafts; only menu choices will be published."
                        : "Unsaved edits are excluded. Review form questions in the checklist."}
                    </p>
                  </details>
                </aside>
              </div>
            )
          )}
        </div>
        <footer className="publication-footer">
          {review && !checking && (
            <p className="field-help" role="status">
              {blocked
                ? `${pendingForms + pendingImages} required approval${pendingForms + pendingImages === 1 ? "" : "s"} remaining.${review.problems.length || review.forms.some((form) => form.status === "unavailable") ? " Resolve the issues listed above." : ""}`
                : `${forms.length + assets.length} additional item${forms.length + assets.length === 1 ? "" : "s"} approved. These approvals take effect when you publish.`}
            </p>
          )}
          <label className="website-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy || checking || blocked}
            />
            {scope === "menu"
              ? "I reviewed this menu and want to make these saved choices public."
              : "I reviewed this website and want to make these saved changes public."}
          </label>
          <div className="publication-footer-actions">
            <button
              className="inline-button"
              disabled={busy || checking}
              onClick={() => {
                setError("");
                recheck();
              }}
            >
              Refresh review
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={onClose}
            >
              Keep drafts
            </button>
            <button
              className="button button-accent"
              disabled={busy || checking || blocked || !confirmed}
              onClick={() => void publish()}
            >
              {busy
                ? "Publishing…"
                : scope === "menu"
                  ? "Publish reviewed menu"
                  : "Publish reviewed website"}
            </button>
          </div>
        </footer>
      </div>
    </Dialog>
  );
}
