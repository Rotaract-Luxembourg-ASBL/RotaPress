"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { ActionsMenu } from "@/ui/actions-menu";
import { ApiError, errorMessage, request, useResource } from "@/ui/api";
import { StatusBadge } from "@/ui/collection";
import { Dialog } from "@/ui/dialog";
import { Icon } from "@/ui/icon";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import { websiteStyle, type Appearance } from "@/features/cms/appearance";
import {
  projectContentSchema,
  type ProjectContent,
  type ProjectDto,
} from "../project_schemas";
import { ProjectFields } from "./project-fields";
import { ProjectStory } from "./project-public";
import {
  discardProject,
  recoverProject,
  retainProject,
} from "./project-unsaved";

type ProjectAction = "publish" | "unpublish" | "archive" | "restore";

export function ProjectEditor({
  id,
  appearance,
}: {
  id: string;
  appearance: Appearance;
}) {
  const { capabilities } = useCurrentUser();
  const allowed = capabilities.includes("cms.edit");
  const { data, error, refresh } = useResource<ProjectDto>(
    allowed ? `/api/admin/projects/${id}` : null,
  );
  if (!allowed)
    return <Notice>You do not have permission to manage projects.</Notice>;
  if (error)
    return (
      <div className="form-stack">
        <Link href="/admin/projects" className="text-link">
          Back to projects
        </Link>
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      </div>
    );
  return data ? (
    <Editor key={data.id} initial={data} appearance={appearance} />
  ) : (
    <Loading />
  );
}

function Editor({
  initial,
  appearance,
}: {
  initial: ProjectDto;
  appearance: Appearance;
}) {
  const { capabilities, actor } = useCurrentUser();
  const [recovered] = useState(() =>
    recoverProject(actor?.email ?? null, initial.id),
  );
  const [saved, setSaved] = useState(recovered?.saved ?? initial);
  const [draft, setDraft] = useState(recovered?.draft ?? initial.draft);
  const [section, setSection] = useState<"story" | "preview">("story");
  const [device, setDevice] = useState("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    recovered
      ? "Your unsaved project edits were recovered in this tab. Review and save them before leaving."
      : "",
  );
  const [stale, setStale] = useState(false);
  const [review, setReview] = useState<ProjectAction | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.draft);
  const canPublish = capabilities.includes("cms.publish");
  const canManageMedia = capabilities.includes("media.manage");
  const disabled = busy || saved.archived || Boolean(review);
  const publicationState = saved.archived
    ? "Archived"
    : !saved.published
      ? "Private draft"
      : saved.changed
        ? "Unpublished changes"
        : "Published";
  useEffect(() => {
    retainProject(saved, draft);
  }, [saved, draft]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const followLink = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !link ||
        link.getAttribute("target") === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (
        busy ||
        !window.confirm("Leave this project and discard unsaved changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        discardProject(saved.id);
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty, busy, saved.id]);
  function change(content: Partial<ProjectContent>) {
    setDraft((current) => ({ ...current, ...content }));
    setMessage("");
  }
  async function operate(action: "save" | ProjectAction) {
    setError("");
    setMessage("");
    if (action === "save") {
      const valid = projectContentSchema.safeParse(draft);
      if (!valid.success) {
        const fieldNames: Record<string, string> = {
          title: "Project title",
          summary: "Short summary",
          story: "Project story",
          outcomes: "Results and impact",
          startDate: "Start date",
          endDate: "End date",
          linkLabel: "Link label",
          linkUrl: "Link address",
        };
        setError(
          valid.error.issues
            .map(
              (issue) =>
                `${fieldNames[String(issue.path[0])] ?? "Project"}: ${issue.message}`,
            )
            .join(" "),
        );
        setSection("story");
        return;
      }
    }
    setBusy(true);
    try {
      const result = await request<ProjectDto>(
        `/api/admin/projects/${saved.id}${action === "save" ? "" : `/${action}`}`,
        {
          method: action === "save" ? "PATCH" : "POST",
          body: JSON.stringify({
            expectedVersion: saved.version,
            ...(action === "save" ? { content: draft } : { confirmed: true }),
          }),
        },
      );
      setSaved(result);
      setDraft(result.draft);
      setReview(null);
      setStale(false);
      const messages = {
        save: "Draft saved. The public project has not changed.",
        publish: "Project published. Visitors can now see this saved story.",
        unpublish: "Project unpublished. Your saved draft is kept.",
        archive: "Project archived. It is private and can be restored later.",
        restore:
          "Project restored as a private draft. Review it before publishing again.",
      };
      setMessage(messages[action]);
    } catch (cause) {
      setError(errorMessage(cause));
      setStale(cause instanceof ApiError && cause.status === 409);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (
      dirty &&
      !window.confirm(
        "Replace your unsaved changes with the latest saved project?",
      )
    )
      return;
    setBusy(true);
    try {
      const current = await request<ProjectDto>(
        `/api/admin/projects/${saved.id}`,
      );
      setSaved(current);
      setDraft(current.draft);
      setError("");
      setStale(false);
      setMessage("Latest saved project loaded.");
      setReview(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="project-editor">
      <Link href="/admin/projects" className="text-link project-back">
        <Icon name="back" /> Back to projects
      </Link>
      <PageHeading
        title={saved.draft.title}
        description="A clear story of your club’s work, from the first idea to its impact."
      >
        <div className="cms-actions">
          {!saved.archived && (
            <button
              className="button button-accent"
              disabled={disabled || !dirty}
              onClick={() => void operate("save")}
            >
              {busy && !review ? "Saving…" : "Save draft"}
            </button>
          )}
          {canPublish && !saved.archived && (
            <button
              className="button button-outline"
              disabled={
                busy ||
                dirty ||
                Boolean(review) ||
                Boolean(saved.published && !saved.changed)
              }
              onClick={() => {
                setError("");
                setReview("publish");
              }}
            >
              Publish saved draft
            </button>
          )}
          {saved.archived ? (
            <button
              className="button button-accent"
              disabled={busy}
              onClick={() => void operate("restore")}
            >
              Restore project
            </button>
          ) : (
            <ActionsMenu
              label="More project actions"
              disabled={busy || Boolean(review)}
            >
              {canPublish && saved.published && (
                <button
                  disabled={dirty}
                  onClick={() => {
                    setError("");
                    setReview("unpublish");
                  }}
                >
                  Unpublish project
                </button>
              )}
              {(!saved.published || canPublish) && (
                <button
                  disabled={dirty}
                  onClick={() => {
                    setError("");
                    setReview("archive");
                  }}
                >
                  Archive project
                </button>
              )}
            </ActionsMenu>
          )}
        </div>
      </PageHeading>
      <div className="project-save-state" role="status">
        <StatusBadge
          tone={
            saved.archived
              ? "neutral"
              : saved.published && !saved.changed
                ? "success"
                : "warning"
          }
        >
          {publicationState}
        </StatusBadge>
        <span>
          {busy
            ? "Working…"
            : dirty
              ? "Unsaved changes. Save before publishing or leaving."
              : "All changes saved."}
        </span>
      </div>
      <section
        className="project-publication-note"
        aria-label="Project publication"
      >
        <p>
          {saved.archived
            ? "This project is archived and hidden from visitors. Restore it to continue editing."
            : saved.published
              ? "Visitors see the last published story. Saving edits keeps that public version unchanged."
              : "Only authorized staff can see this draft. Publish it when you are ready to share it."}
        </p>
        {saved.published && !saved.archived && (
          <Link
            href={`/projects/${saved.slug}`}
            target="_blank"
            className="text-link"
          >
            View public project <Icon name="external" />
          </Link>
        )}
        {!canPublish && !saved.archived && (
          <p className="field-help">
            You can prepare and save this project. A staff member with
            publishing permission can make it public.
          </p>
        )}
      </section>
      {message && <Notice kind="success">{message}</Notice>}
      {error && !review && (
        <Notice>
          {error}
          {stale && (
            <>
              {" "}
              Your entered changes are kept. Copy anything you want to preserve,
              then{" "}
              <button
                className="inline-button"
                disabled={busy}
                onClick={() => void reload()}
              >
                Load latest saved project
              </button>
              .
            </>
          )}
        </Notice>
      )}
      <div
        className="admin-workspace-tabs"
        role="group"
        aria-label="Project workspace"
      >
        <button
          type="button"
          aria-pressed={section === "story"}
          onClick={() => setSection("story")}
        >
          Edit story
        </button>
        <button
          type="button"
          aria-pressed={section === "preview"}
          onClick={() => setSection("preview")}
        >
          Preview project
        </button>
      </div>
      {section === "story" ? (
        <ProjectFields
          draft={draft}
          change={change}
          disabled={disabled}
          canManageMedia={canManageMedia}
        />
      ) : (
        <section
          className="project-preview-panel form-stack"
          aria-label="Private project preview"
        >
          <div className="project-preview-toolbar">
            <p className="field-help">
              Private preview of your current edits, including unsaved changes.
              Your website header and footer appear on the public page.
            </p>
            <div
              className="cms-actions"
              role="group"
              aria-label="Project preview width"
            >
              <button
                className="button button-outline"
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                Desktop
              </button>
              <button
                className="button button-outline"
                aria-pressed={device === "phone"}
                onClick={() => setDevice("phone")}
              >
                Phone
              </button>
            </div>
          </div>
          <div
            className="cms-public project-draft-preview"
            data-width={device}
            data-theme={appearance.themeId}
            style={websiteStyle(appearance)}
          >
            <ProjectStory
              project={{ ...draft, id: saved.id, slug: saved.slug }}
              preview
            />
          </div>
        </section>
      )}
      {review && (
        <Dialog
          title={
            review === "publish"
              ? "Publish project"
              : review === "unpublish"
                ? "Unpublish project"
                : "Archive project"
          }
          onClose={() => setReview(null)}
          canClose={() => !busy}
        >
          <div className="form-stack">
            <p>
              {review === "publish"
                ? `Publish “${saved.draft.title}”? The saved story will appear on your Projects page and in website blocks that include it.`
                : review === "unpublish"
                  ? `Unpublish “${saved.draft.title}”? It will disappear from your public Projects page and project blocks. Your saved draft is kept and can be published again.`
                  : `Archive “${saved.draft.title}”? It will be removed from the public website and active project list. Its content is kept, and restoring it creates a private draft.`}
            </p>
            {review === "publish" && (
              <>
                <p className="field-help">
                  Only this saved project is published. A cover image must
                  already be public in Media.
                </p>
                {!saved.draft.summary.trim() && (
                  <Notice>
                    Add a short summary before publishing. Return to Edit story,
                    enter the summary and save your draft.
                  </Notice>
                )}
              </>
            )}
            {error && (
              <Notice>
                {error}
                {stale &&
                  " Close this review to load the latest saved project."}
              </Notice>
            )}
            {error && review === "publish" && canManageMedia && (
              <Link href="/admin/media" target="_blank" className="text-link">
                Review image visibility in Media <Icon name="external" />
              </Link>
            )}
            <div className="cms-actions">
              <button
                className="button button-accent"
                disabled={
                  busy || (review === "publish" && !saved.draft.summary.trim())
                }
                onClick={() => void operate(review)}
              >
                {busy
                  ? "Working…"
                  : review === "publish"
                    ? "Confirm publication"
                    : review === "unpublish"
                      ? "Confirm unpublication"
                      : "Confirm archive"}
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
        </Dialog>
      )}
    </div>
  );
}
