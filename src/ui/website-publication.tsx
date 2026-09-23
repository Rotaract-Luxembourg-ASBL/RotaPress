"use client";
import Image from "next/image";
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
  const [confirmed, setConfirmed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const recheck = useCallback(() => {
    setReview(undefined);
    setConfirmed(false);
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
          setError("");
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
  useEffect(() => {
    const refresh = () => {
      if (!busy) recheck();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [busy, recheck]);
  const blocked =
    !review || review.images.length > 0 || review.problems.length > 0;
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
        }),
      });
      onPublished(scope);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Publish website" onClose={onClose} canClose={() => !busy}>
      <div className="form-stack website-publication">
        <fieldset className="website-publication-scope" disabled={busy}>
          <legend>What would you like to publish?</legend>
          {(["menu", "website"] as const).map((choice) => (
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
                    ? "Homepage, Events page and navigation links."
                    : "Saved pages, menu, shared parts and website settings."}
                </small>
              </span>
            </label>
          ))}
          {!workspace.site.published && (
            <p className="field-help">
              Publish the entire website once to enable menu-only updates.
            </p>
          )}
        </fieldset>
        <p>
          {scope === "menu"
            ? "Publish your saved homepage and menu choices. Page content, branding and other pending edits stay as they are."
            : "Publish the saved pages below together with your menu, selected header and footer, and appearance."}
        </p>
        {error && (
          <Notice>
            {error}{" "}
            <button
              className="inline-button"
              onClick={recheck}
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
            <>
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
                        Open page
                      </a>
                    </>
                  )}
                </Notice>
              ))}
              {review.images.length > 0 && (
                <section
                  className="website-publication-images"
                  aria-label="Images to review"
                >
                  <h3>
                    {review.images.length === 1
                      ? "One image needs attention"
                      : `${review.images.length} images need attention`}
                  </h3>
                  <p>
                    Open each private image in Media, change its visibility to
                    Public and save. You can also replace or remove it where it
                    is used.
                  </p>
                  <ul>
                    {review.images.map((image, index) => (
                      <li key={image.id ?? index}>
                        {image.id && (
                          <Image
                            className="publication-image-preview"
                            src={`/media/${image.id}`}
                            alt=""
                            width={64}
                            height={64}
                            unoptimized
                            data-private
                          />
                        )}
                        <div>
                          <strong>{image.name}</strong>
                          <span className="publication-image-status">
                            {image.status === "private"
                              ? "Private image"
                              : "Image unavailable"}
                          </span>
                          {image.uses.map((use) => (
                            <a
                              key={use.label + use.href}
                              href={use.href}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {use.label}
                            </a>
                          ))}
                          {image.id && (
                            <a
                              className="text-link"
                              href={`/admin/media?asset=${image.id}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Review ${image.name} in Media`}
                            >
                              Review image in Media ↗
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="button button-outline"
                    onClick={recheck}
                    disabled={busy}
                  >
                    Check again
                  </button>
                </section>
              )}
              {scope === "website" && workspace.site.draft.contactFormId && (
                <p className="field-help">
                  This website includes a contact form.{" "}
                  <a
                    href={`/admin/forms/${workspace.site.draft.contactFormId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Review and publish its questions
                  </a>{" "}
                  before publishing the website.
                </p>
              )}
              <ul
                className="website-publication-list"
                aria-label={
                  scope === "menu" ? "Linked pages" : "Reviewed pages"
                }
              >
                {review.pages.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.kind === "page" ? "Page" : item.kind} ·{" "}
                      {item.changed ? "Saved draft" : "Keep published version"}
                    </span>
                  </li>
                ))}
              </ul>
              {!review.pages.length && (
                <p className="field-help">
                  This menu has no linked website pages.
                </p>
              )}
              <p className="field-help">
                {scope === "menu"
                  ? "Menu links use the currently published pages. Unpublished pages must be published first."
                  : "Other saved pages are not changed. Previously published pages keep their existing URLs. Unsaved editor changes are not included."}
              </p>
            </>
          )
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
    </Dialog>
  );
}
