"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentUser } from "@/ui/admin-shell";
import { errorMessage, request, useResource } from "@/ui/api";
import {
  Collection,
  CollectionEmpty,
  CollectionRow,
  CollectionToolbar,
  FilterTabs,
  StatusBadge,
  SummaryStats,
} from "@/ui/collection";
import { Dialog } from "@/ui/dialog";
import { Icon } from "@/ui/icon";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import type { ProjectDto } from "../project_schemas";
import { projectStatusLabels } from "./project-public";

export function ProjectsPanel() {
  const { capabilities } = useCurrentUser();
  const canEdit = capabilities.includes("cms.edit");
  const { data, error, refresh } = useResource<{ items: ProjectDto[] }>(
    canEdit ? "/api/admin/projects" : null,
  );
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  if (!canEdit)
    return <Notice>You do not have permission to manage projects.</Notice>;
  const projects = data?.items ?? [];
  const counts = {
    active: projects.filter((item) => !item.archived).length,
    published: projects.filter((item) => !item.archived && item.published)
      .length,
    draft: projects.filter((item) => !item.archived && !item.published).length,
    archived: projects.filter((item) => item.archived).length,
  };
  const items = projects.filter((item) => {
    const matches =
      filter === "archived"
        ? item.archived
        : !item.archived &&
          (filter === "active" ||
            (filter === "published"
              ? Boolean(item.published)
              : !item.published));
    return (
      matches &&
      `${item.draft.title} ${item.draft.summary} ${item.draft.location}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
    );
  });
  const clear = () => {
    setQuery("");
    setFilter("active");
  };
  return (
    <>
      <PageHeading
        title="Projects"
        description="Share the volunteer actions and ongoing initiatives that make a difference in your community."
      >
        <button
          className="button button-accent"
          onClick={() => setCreating(true)}
        >
          <Icon name="plus" /> New project
        </button>
      </PageHeading>
      <p className="project-workspace-help">
        Start with a short story, add a photo and share the results. Published
        projects appear on your{" "}
        <Link href="/projects" target="_blank" className="text-link">
          Projects page <Icon name="external" />
        </Link>
        .
      </p>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {data && (
        <SummaryStats
          label="Project counts"
          items={[
            {
              label: "Active projects",
              value: counts.active,
              hint: "All projects except archived",
              icon: "outline",
              onClick: () => setFilter("active"),
              selected: filter === "active",
            },
            {
              label: "Published",
              value: counts.published,
              hint: "Visible on your Projects page",
              icon: "check",
              onClick: () => setFilter("published"),
              selected: filter === "published",
            },
            {
              label: "Drafts",
              value: counts.draft,
              hint: "Not published yet",
              icon: "edit",
              onClick: () => setFilter("draft"),
              selected: filter === "draft",
            },
            {
              label: "Archived",
              value: counts.archived,
              hint: "Kept privately and can be restored",
              icon: "archive",
              onClick: () => setFilter("archived"),
              selected: filter === "archived",
            },
          ]}
        />
      )}
      <Collection
        label="Project collection"
        noun="Project"
        detailLabel="Progress"
        toolbar={
          <>
            <FilterTabs
              label="Project filters"
              value={filter}
              onChange={setFilter}
              options={[
                {
                  value: "active",
                  label: "Active",
                  count: data ? counts.active : undefined,
                },
                {
                  value: "published",
                  label: "Published",
                  count: data ? counts.published : undefined,
                },
                {
                  value: "draft",
                  label: "Drafts",
                  count: data ? counts.draft : undefined,
                },
                {
                  value: "archived",
                  label: "Archived",
                  count: data ? counts.archived : undefined,
                },
              ]}
            />
            <CollectionToolbar
              searchLabel="Search projects"
              query={query}
              onQuery={setQuery}
            >
              {(query || filter !== "active") && (
                <button className="button button-outline" onClick={clear}>
                  Clear filters
                </button>
              )}
            </CollectionToolbar>
          </>
        }
        footer={
          data &&
          `${items.length} of ${projects.length} projects shown · Counts include all saved projects; search filters the rows.`
        }
      >
        {!data && !error && <Loading />}
        {data && (
          <>
            <ul className="admin-collection-rows">
              {items.map((item) => (
                <CollectionRow
                  key={item.id}
                  icon={<Icon name="outline" />}
                  title={
                    <Link href={`/admin/projects/${item.id}`}>
                      {item.draft.title}
                    </Link>
                  }
                  description={
                    item.draft.summary ||
                    "Add a short summary to introduce this project."
                  }
                  status={
                    <StatusBadge
                      tone={
                        item.archived
                          ? "neutral"
                          : !item.published || item.changed
                            ? "warning"
                            : "success"
                      }
                    >
                      {item.archived
                        ? "Archived"
                        : !item.published
                          ? "Draft"
                          : item.changed
                            ? "Unpublished changes"
                            : "Published"}
                    </StatusBadge>
                  }
                  detail={{
                    label: "Progress",
                    value: projectStatusLabels[item.draft.status],
                  }}
                  actions={
                    <Link
                      className="button button-outline"
                      href={`/admin/projects/${item.id}`}
                    >
                      {item.archived ? "View project" : "Edit project"}
                    </Link>
                  }
                />
              ))}
            </ul>
            {!items.length && (
              <CollectionEmpty
                icon="outline"
                title={
                  !projects.length
                    ? "Tell the story of your first project"
                    : "No matching projects"
                }
                description={
                  !projects.length
                    ? "A park clean-up, food collection or ongoing community initiative all belong here. Create a private draft and publish when you are ready."
                    : filter === "archived"
                      ? "Archived projects will appear here. You can restore them as private drafts."
                      : "Try another search or project filter."
                }
              >
                {!projects.length ? (
                  <button
                    className="button button-accent"
                    onClick={() => setCreating(true)}
                  >
                    Create your first project
                  </button>
                ) : (
                  <button className="button button-outline" onClick={clear}>
                    Clear filters
                  </button>
                )}
              </CollectionEmpty>
            )}
          </>
        )}
      </Collection>
      {creating && <NewProject close={() => setCreating(false)} />}
    </>
  );
}

function NewProject({ close }: { close: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canClose = () =>
    !busy &&
    (!(title.trim() || summary.trim()) ||
      window.confirm(
        "Discard this unsaved project? Nothing has been created yet.",
      ));
  async function create() {
    setBusy(true);
    setError("");
    try {
      const item = await request<ProjectDto>("/api/admin/projects", {
        method: "POST",
        body: JSON.stringify({ title, summary }),
      });
      router.push(`/admin/projects/${item.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }
  return (
    <Dialog title="New project" onClose={close} canClose={canClose}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <p>
          Start with a name and a short introduction. Your project stays private
          until you publish it.
        </p>
        {error && <Notice>{error}</Notice>}
        <fieldset className="editor-fieldset form-stack" disabled={busy}>
          <label>
            Project title
            <input
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="For example, Riverside clean-up"
            />
          </label>
          <label>
            Short summary
            <textarea
              maxLength={320}
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="What are you doing, and who will it help?"
            />
          </label>
        </fieldset>
        <div className="cms-actions">
          <button className="button button-accent" disabled={busy}>
            {busy ? "Creating draft…" : "Create draft"}
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() => {
              if (canClose()) close();
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}
