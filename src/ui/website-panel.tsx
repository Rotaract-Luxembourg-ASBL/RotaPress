"use client";
import type { KitId } from "@/features/cms/kits/catalogue";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CmsDetail,
  CmsLocale,
  CmsSummary,
} from "@/features/cms/cms_schemas";
import { errorMessage, request } from "./api";
import { Notice } from "./primitives";
import { Dialog } from "./dialog";
import { Icon } from "./icon";
import {
  Collection,
  CollectionEmpty,
  CollectionRow,
  CollectionToolbar,
  FilterTabs,
  SummaryStats,
  UpdatedDate,
} from "./collection";
import { ContentStatus, contentStatus } from "./content-status";
import { TemplatePicker } from "@/features/cms/kits/ui/template-picker";

function NewContent({
  kind,
  locale,
  kitId,
  canLeave,
  onClose,
}: {
  kind: "page" | "section";
  locale: CmsLocale;
  kitId?: KitId;
  canLeave: () => boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState<string>();
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canLeave()) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setProblem(undefined);
    try {
      const result = await request<CmsDetail>("/api/admin/cms/content", {
        method: "POST",
        body: JSON.stringify({
          kind,
          title: fields.get("title"),
          slug: fields.get("slug"),
          locale: fields.get("locale"),
          templateId: fields.get("templateId") ?? "blank",
        }),
      });
      router.push(`/admin/website/${result.id}?locale=${result.locale}`);
    } catch (cause) {
      setProblem(errorMessage(cause));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={kind === "page" ? "New page" : "New reusable section"}
      onClose={onClose}
      canClose={() =>
        !busy && (!dirty || window.confirm("Discard this unsaved content?"))
      }
    >
      <form
        className="form-stack"
        onSubmit={create}
        onChange={() => setDirty(true)}
        aria-busy={busy}
      >
        {problem && <Notice>{problem}</Notice>}
        <label>
          Title
          <input name="title" required maxLength={160} disabled={busy} />
        </label>
        <label>
          URL slug
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={100}
            placeholder="about-us"
            disabled={busy}
          />
          <span className="field-help">
            Lowercase letters, numbers and hyphens.
          </span>
        </label>
        <label>
          Language
          <select name="locale" defaultValue={locale} disabled={busy}>
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="lb">Luxembourgish</option>
          </select>
        </label>
        <p className="field-help">
          Opens in the editor as a private draft. Translations are written
          separately.
        </p>
        {kind === "page" && <TemplatePicker disabled={busy} kitId={kitId} />}
        <button className="button button-accent" disabled={busy}>
          {busy ? "Creating…" : "Create draft"}
        </button>
        <span className="small muted" role="status">
          {busy ? "Creating your draft…" : ""}
        </span>
      </form>
    </Dialog>
  );
}

export function WebsiteContentList({
  contents,
  selectedIds,
  kitId,
  kind,
  locale,
  homePageId,
  canLeave,
}: {
  contents: CmsSummary[];
  selectedIds: string[] | null;
  kitId?: KitId;
  kind: "page" | "section";
  locale: CmsLocale;
  homePageId: string | null;
  canLeave: () => boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [collection, setCollection] = useState("website");
  const candidates = contents.filter(
    (item) => item.kind === kind && item.locale === locale,
  );
  const scoped = candidates.filter(
    (item) =>
      collection === "all" ||
      (collection === "examples"
        ? item.demonstration
        : !item.demonstration &&
          (!kitId ||
            !item.kitId ||
            item.kitId === kitId ||
            selectedIds?.includes(item.id) ||
            item.id === homePageId)),
  );
  const active = scoped.filter((item) => !item.archived);
  const counts = {
    all: active.length,
    draft: active.filter((item) => !item.publishedRevisionId).length,
    published: active.filter((item) => item.publishedRevisionId).length,
    changes: active.filter((item) => contentStatus(item).key === "changes")
      .length,
    archived: scoped.filter((item) => item.archived).length,
  };
  const items = scoped.filter(
    (item) =>
      (state === "all"
        ? !item.archived
        : state === "published"
          ? !item.archived && Boolean(item.publishedRevisionId)
          : contentStatus(item).key === state) &&
      (item.title + " " + item.slug)
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <section
      aria-label={kind === "page" ? "Website pages" : "Reusable sections"}
    >
      <div className="website-section-heading website-section-actions">
        <div>
          <h2>{kind === "page" ? "Pages" : "Reusable sections"}</h2>
          <p>
            {kind === "page"
              ? "Edit the content of your website. Manage its menu in Menus."
              : "Content shared across several pages."}
          </p>
        </div>
        <button
          className="button button-accent"
          onClick={() => setCreating(true)}
        >
          <Icon name="plus" />
          {kind === "page" ? "New page" : "New reusable section"}
        </button>
      </div>
      <SummaryStats
        label="Website content counts"
        items={[
          {
            label: kind === "page" ? "Active pages" : "Active sections",
            value: counts.all,
            hint: "In the selected collection and language",
            icon: "website",
            onClick: () => setState("all"),
            selected: state === "all",
          },
          {
            label: "Published",
            value: counts.published,
            hint: "Have a public version",
            icon: "check",
            onClick: () => setState("published"),
            selected: state === "published",
          },
          {
            label: "Drafts",
            value: counts.draft,
            hint: "Not published yet",
            icon: "edit",
            onClick: () => setState("draft"),
            selected: state === "draft",
          },
          {
            label: "Unpublished changes",
            value: counts.changes,
            hint: "Saved edits waiting to be published",
            icon: "edit",
            onClick: () => setState("changes"),
            selected: state === "changes",
          },
        ]}
      />
      <Collection
        label={kind === "page" ? "Page list" : "Section list"}
        noun={kind === "page" ? "Page" : "Section"}
        detailLabel="Last updated"
        toolbar={
          <>
            <FilterTabs
              label="Publication status"
              value={state}
              onChange={setState}
              options={[
                { value: "all", label: "All active", count: counts.all },
                {
                  value: "published",
                  label: "Published",
                  count: counts.published,
                },
                { value: "draft", label: "Drafts", count: counts.draft },
                {
                  value: "changes",
                  label: "Unpublished changes",
                  count: counts.changes,
                },
                {
                  value: "archived",
                  label: "Archived",
                  count: counts.archived,
                },
              ]}
            />
            <CollectionToolbar
              searchLabel={kind === "page" ? "Search pages" : "Search sections"}
              query={query}
              onQuery={setQuery}
            >
              <select
                aria-label="Collection"
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
              >
                <option value="website">This website</option>
                <option value="all">All saved pages</option>
                <option value="examples">Previous examples</option>
              </select>
              {query && (
                <button
                  className="button button-outline"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              )}
            </CollectionToolbar>
          </>
        }
        footer={
          items.length +
          " of " +
          scoped.length +
          " shown · Other template copies and examples remain in All saved pages."
        }
      >
        <ul className="admin-collection-rows">
          {items.map((item) => (
            <CollectionRow
              key={item.id}
              icon={<Icon name={kind === "page" ? "website" : "duplicate"} />}
              title={
                <>
                  <Link
                    href={"/admin/website/" + item.id + "?locale=" + locale}
                    onNavigate={(event) => {
                      if (!canLeave()) event.preventDefault();
                    }}
                  >
                    {item.title}
                  </Link>
                  {item.id === homePageId && (
                    <span className="home-marker">Homepage</span>
                  )}
                  {item.demonstration && (
                    <span className="home-marker">Example</span>
                  )}
                </>
              }
              description={
                item.kind === "page"
                  ? "/pages/" + locale + "/" + item.slug
                  : "Reusable section"
              }
              status={<ContentStatus item={item} />}
              detail={{
                label: "Updated",
                value: <UpdatedDate value={item.updatedAt} />,
              }}
              actions={
                <>
                  <Link
                    className="text-link"
                    href={
                      "/admin/website/" + item.id + "/preview?locale=" + locale
                    }
                    target="_blank"
                  >
                    Preview
                  </Link>
                  <Link
                    className="button button-outline"
                    href={"/admin/website/" + item.id + "?locale=" + locale}
                    onNavigate={(event) => {
                      if (!canLeave()) event.preventDefault();
                    }}
                  >
                    Edit
                  </Link>
                </>
              }
            />
          ))}
        </ul>
        {!items.length && (
          <CollectionEmpty
            icon="website"
            title="No pages in this view"
            description="Create a page, choose a template or change the filters."
          >
            <button
              className="button button-outline"
              onClick={() => {
                setQuery("");
                setState("all");
              }}
            >
              Clear filters
            </button>
          </CollectionEmpty>
        )}
      </Collection>
      {creating && (
        <NewContent
          kind={kind}
          locale={locale}
          kitId={kitId}
          canLeave={canLeave}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}
