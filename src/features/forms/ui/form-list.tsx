"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormDto } from "../form_types";
import { useCurrentUser } from "@/ui/admin-shell";
import { useResource } from "@/ui/api";
import { Icon } from "@/ui/icon";
import { Loading, Notice, PageHeading } from "@/ui/primitives";
import {
  Collection,
  CollectionEmpty,
  CollectionRow,
  CollectionToolbar,
  FilterTabs,
  StatusBadge,
  SummaryStats,
  UpdatedDate,
} from "@/ui/collection";
import { FormArchiveAction, formArchiveMessage } from "./form-archive-action";
import { FormCreatePanel } from "./form-create-panel";
import { isContentElement } from "../form_elements";

export function FormList() {
  const user = useCurrentUser();
  const { data, error, refresh } = useResource<{ forms: FormDto[] }>(
    "/api/admin/forms",
  );
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState("active");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("updated");
  const [message, setMessage] = useState("");
  const forms = data?.forms ?? [];
  const active = forms.filter((form) => !form.archived);
  const counts = {
    active: active.length,
    published: active.filter((form) => form.publishedVersionId).length,
    draft: active.filter((form) => !form.publishedVersionId).length,
    archived: forms.filter((form) => form.archived).length,
  };
  const visible = forms
    .filter((form) => {
      const matchesView =
        view === "archived"
          ? form.archived
          : !form.archived &&
            (view === "active" ||
              (view === "published"
                ? Boolean(form.publishedVersionId)
                : !form.publishedVersionId));
      return (
        matchesView &&
        (kind === "all" || form.kind === kind) &&
        form.draft.title
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? a.draft.title.localeCompare(b.draft.title)
        : sort === "responses"
          ? (b.responses?.total ?? 0) - (a.responses?.total ?? 0)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  function clear() {
    setQuery("");
    setKind("all");
    setView("active");
    setSort("updated");
  }
  if (!user.capabilities.includes("forms.edit"))
    return <Notice>You do not have permission to manage forms.</Notice>;
  return (
    <div className="form-dashboard">
      <PageHeading
        title="Forms"
        description="Create a form, share it with your community and keep every response in one place."
      >
        <div className="forms-actions">
          {user.capabilities.includes("submissions.read") && (
            <Link href="/admin/inbox" className="button button-outline">
              <Icon name="mail" />
              Response center
            </Link>
          )}
          <button
            className="button button-accent"
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" />
            New form
          </button>
        </div>
      </PageHeading>
      {error && (
        <Notice>
          {error}{" "}
          <button className="inline-button" onClick={refresh}>
            Try again
          </button>
        </Notice>
      )}
      {message && <Notice kind="success">{message}</Notice>}
      {data && (
        <SummaryStats
          label="Form counts"
          items={[
            {
              label: "Active forms",
              value: counts.active,
              hint: "Ready to edit or share",
              icon: "forms",
              onClick: () => setView("active"),
              selected: view === "active",
            },
            {
              label: "Published",
              value: counts.published,
              hint: "Have a published version",
              icon: "check",
              onClick: () => setView("published"),
              selected: view === "published",
            },
            {
              label: "Drafts",
              value: counts.draft,
              hint: "Not published yet",
              icon: "edit",
              onClick: () => setView("draft"),
              selected: view === "draft",
            },
            {
              label: "Archived",
              value: counts.archived,
              hint: "Responses are retained",
              icon: "archive",
              onClick: () => setView("archived"),
              selected: view === "archived",
            },
          ]}
        />
      )}
      <Collection
        label="Your forms"
        noun="Form"
        detailLabel="Last updated"
        toolbar={
          <>
            <FilterTabs
              label="Filter forms by status"
              value={view}
              onChange={setView}
              options={[
                {
                  value: "active",
                  label: "All active",
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
              searchLabel="Search forms"
              query={query}
              onQuery={setQuery}
            >
              <select
                aria-label="Form type"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="all">All types</option>
                <option value="contact">Website forms</option>
                <option value="membership">Membership</option>
              </select>
              <select
                aria-label="Sort forms"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="updated">Recently updated</option>
                <option value="name">Name A–Z</option>
                {user.capabilities.includes("submissions.read") && (
                  <option value="responses">Most responses</option>
                )}
              </select>
              {(query || kind !== "all") && (
                <button className="button button-outline" onClick={clear}>
                  Clear filters
                </button>
              )}
            </CollectionToolbar>
          </>
        }
        footer={
          data &&
          `${visible.length} of ${forms.length} forms shown · Responses are managed in the Response center.`
        }
      >
        {!data && !error && <Loading />}
        {data && (
          <>
            <ul className="admin-collection-rows">
              {visible.map((form) => (
                <CollectionRow
                  key={form.id}
                  icon={<Icon name="forms" />}
                  title={
                    <Link href={`/admin/forms/${form.id}`}>
                      {form.draft.title}
                    </Link>
                  }
                  description={
                    <>
                      <span>
                        {form.kind === "membership"
                          ? "Membership application"
                          : "Website form"}{" "}
                        ·{" "}
                        {
                          form.draft.fields.filter(
                            (field) => !isContentElement(field.type),
                          ).length
                        }{" "}
                        questions ·{" "}
                        {1 +
                          form.draft.fields.filter(
                            (field) => field.type === "page_break",
                          ).length}{" "}
                        {form.draft.fields.some(
                          (field) => field.type === "page_break",
                        )
                          ? "pages"
                          : "page"}
                      </span>
                      {form.responses && (
                        <span>
                          {form.responses.total} responses ·{" "}
                          {form.responses.new} new
                        </span>
                      )}
                    </>
                  }
                  status={
                    <StatusBadge
                      tone={
                        form.archived
                          ? "neutral"
                          : form.publishedVersionId
                            ? "success"
                            : "warning"
                      }
                    >
                      {form.archived
                        ? "Archived"
                        : form.publishedVersionId
                          ? form.publishedVersionNumber !== form.draftRevision
                            ? "Unpublished changes"
                            : "Published"
                          : "Draft"}
                    </StatusBadge>
                  }
                  detail={{
                    label: "Updated",
                    value: <UpdatedDate value={form.updatedAt} />,
                  }}
                  actions={
                    <>
                      {user.capabilities.includes("submissions.read") && (
                        <Link
                          className="text-link"
                          href={`/admin/inbox?formId=${form.id}`}
                        >
                          Responses
                        </Link>
                      )}
                      <Link
                        className="button button-outline"
                        href={`/admin/forms/${form.id}`}
                      >
                        {form.archived ? "View" : "Edit form"}
                      </Link>
                      <FormArchiveAction
                        form={form}
                        onDeleted={() => {
                          setMessage("Form permanently deleted.");
                          refresh();
                        }}
                        onChanged={(next) => {
                          setMessage(formArchiveMessage(next));
                          refresh();
                        }}
                      />
                    </>
                  }
                />
              ))}
            </ul>
            {!visible.length && (
              <CollectionEmpty
                icon={view === "archived" ? "archive" : "forms"}
                title={
                  !forms.length
                    ? "Start with your first form"
                    : "No forms to show"
                }
                description={
                  !forms.length
                    ? "Choose a template, make it yours, then share a link or add it to your website."
                    : view === "archived"
                      ? "Archived forms appear here. Their existing responses are kept."
                      : "Try another search or change the status and type filters."
                }
              >
                {!forms.length ? (
                  <button
                    className="button button-accent"
                    onClick={() => setCreating(true)}
                  >
                    Create your first form
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
      {creating && <FormCreatePanel onClose={() => setCreating(false)} />}
    </div>
  );
}
